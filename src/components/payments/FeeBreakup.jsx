import React, { useEffect, useState } from 'react';
import { formatAmount } from "../../utils/safeFormat";
import { api } from "../../lib/api";
import { calculateFee } from "../../utils/feeCalculator"; // v396

export default function FeeBreakup({ grossAmount, appliedCoupon, role = 'brand', onDetailsCalculated }) {
  const [feeLabel, setFeeLabel] = useState('Convenience fee & TDS'); // v330: fee label (Ravi)
  const [feeDetails, setFeeDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const { data: config } = await api.get('platform/fee-config');
        setFeeLabel(config?.fee_kind && config.fee_kind !== 'platform' ? (config.fee_label || 'Convenience fee & TDS') : 'Convenience fee & TDS'); // session 36: offer / creator coupon
        // v396 (QA M-6 / M-9): the same calculator the server charges with (src/utils/feeCalculator.ts) — this screen kept
        // its own formula (fixed 18 % GST, no split model), so the brand saw "₹33,333" while paying ₹36,480.
        const calc = await calculateFee(Number(grossAmount) || 0, appliedCoupon && appliedCoupon.type ? appliedCoupon : null, null, { config: config || {} });
        const details = {
          grossAmount,
          feePercent: calc.feePercent,
          platformFee: calc.platformFee,
          gstAmount: calc.gstAmount,
          creatorNet: calc.creatorNet,
          discountApplied: calc.discountApplied || 0,
          appliedCoupon,
          brandFeePercent: Number(calc.brandFeePercent) || 0,
          brandFee: Number(calc.brandFee) || 0,
          brandFeeGst: Number(calc.brandFeeGst) || 0,
          brandPayable: Number(calc.brandPayable) || 0,
        };
        setFeeDetails(details);
        if (onDetailsCalculated) onDetailsCalculated(details);
      } catch (err) {
        // Fallback (only used if the /platform/fee-config API call fails) must match
        // the real platform default (15% below ₹20,000, 5% at/above) — not an arbitrary
        // number — otherwise a failed request would show the user a lower fee than
        // what they'll actually be charged.
        let rate = grossAmount < 20000 ? 15 : 5;
        let platformFee = Math.round((grossAmount * rate) / 100);
        let discountApplied = 0;

        if (appliedCoupon && appliedCoupon.type) {
          if (appliedCoupon.type === 'zero_fee') {
            rate = 0;
            discountApplied = platformFee;
            platformFee = 0;
          } else if (appliedCoupon.type === 'fee_rate_override' || appliedCoupon.type === 'override_fee_rate') {
            const overrideRate = Number(appliedCoupon.override_fee_rate ?? appliedCoupon.value ?? 0);
            rate = overrideRate;
            const origFee = platformFee;
            platformFee = Math.round((grossAmount * overrideRate) / 100);
            discountApplied = Math.max(0, origFee - platformFee);
          } else if (appliedCoupon.type === 'flat_discount') {
            const flatDisc = Number(appliedCoupon.discount_amount ?? appliedCoupon.value ?? 0);
            discountApplied = Math.min(platformFee, flatDisc);
            platformFee = Math.max(0, platformFee - flatDisc);
          }
        }

        const details = {
          grossAmount,
          feePercent: rate,
          platformFee,
          gstAmount: 0,
          creatorNet: Math.round(grossAmount - platformFee),
          discountApplied,
          appliedCoupon
        };
        setFeeDetails(details);
        if (onDetailsCalculated) onDetailsCalculated(details);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [grossAmount, appliedCoupon]);

  if (loading || !feeDetails) return <div className="animate-pulse h-32 bg-[var(--bg-elevated)] rounded-xl"></div>;

  const isBrand = role === 'brand';

  // Brand view: Simple total order escrow summary without revealing creator deductions
  if (isBrand) {
    const flatDiscount = appliedCoupon?.type === 'flat_discount' ? Number(appliedCoupon.discount_amount || appliedCoupon.value || 0) : 0;
    // v396 (QA M-6): split model — the brand pays the deal amount + service fee + GST on it
    const brandPayable = feeDetails.brandFee > 0 ? feeDetails.brandPayable : Math.max(0, feeDetails.grossAmount - flatDiscount);

    return (
      <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-5 text-sm">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[var(--text-secondary)]">Campaign / Order Budget</span>
          <span className="font-bold text-[var(--text-primary)]">₹{formatAmount(feeDetails.grossAmount)}</span>
        </div>

        {appliedCoupon && (
          <div className="flex justify-between items-center mb-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <span className="font-medium text-xs flex items-center gap-1.5">
              🏷️ Promo Code Applied ({appliedCoupon.code})
            </span>
            <span className="font-bold text-xs">
              {flatDiscount > 0 ? `-₹${flatDiscount.toLocaleString('en-IN')} Discount` : (appliedCoupon.description || 'Special Promo Applied')}
            </span>
          </div>
        )}

        {feeDetails.brandFee > 0 && (
          <>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[var(--text-secondary)]">Service fee ({feeDetails.brandFeePercent}%)</span>
              <span className="font-semibold text-[var(--text-primary)]">₹{formatAmount(feeDetails.brandFee)}</span>
            </div>
            {feeDetails.brandFeeGst > 0 && (
              <div className="flex justify-between items-center mb-3">
                <span className="text-[var(--text-secondary)]">GST on service fee</span>
                <span className="font-semibold text-[var(--text-primary)]">₹{formatAmount(feeDetails.brandFeeGst)}</span>
              </div>
            )}
          </>
        )}

        <div className="flex justify-between items-center mb-3">
          <span className="text-[var(--text-secondary)]">Ybex secure payment hold</span>
          <span className="text-emerald-400 font-semibold text-xs">✓ Included (100% Secured)</span>
        </div>

        <div className="flex justify-between items-center mb-3">
          <span className="text-[var(--text-secondary)]">Funds Holding Policy</span>
          <span className="text-emerald-400 font-semibold text-xs">Locked until content approval</span>
        </div>

        <div className="flex justify-between items-center pb-3 border-b border-[var(--border-default)]">
          <span className="text-[var(--text-secondary)]">Payment Processing</span>
          <span className="text-emerald-400 font-semibold text-xs">Instant Settlement</span>
        </div>

        <div className="flex justify-between items-center pt-2">
          <span className="font-bold text-[var(--text-primary)]">Total Payment Hold Deposit</span>
          <span className="font-display text-[var(--violet)] font-bold text-xl tracking-tight">₹{brandPayable.toLocaleString('en-IN')}</span>
        </div>
      </div>
    );
  }

  // Creator view: Full fee deduction and net payout breakdown
  return (
    <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-5 text-sm">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[var(--text-secondary)]">Campaign / Order Amount</span>
        <span className="font-bold text-[var(--text-primary)]">₹{formatAmount(feeDetails.grossAmount)}</span>
      </div>

      {appliedCoupon && (
        <div className="flex justify-between items-center mb-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <span className="font-medium text-xs flex items-center gap-1.5">
            🏷️ Promo Code Applied ({appliedCoupon.code})
          </span>
          <span className="font-bold text-xs">
            {appliedCoupon.type === 'zero_fee' && "100% Fee Waiver (₹0 Fee)"}
            {(appliedCoupon.type === 'fee_rate_override' || appliedCoupon.type === 'override_fee_rate') && `${appliedCoupon.override_fee_rate ?? 0}% Special Fee Rate`}
            {appliedCoupon.type === 'flat_discount' && `-₹${Number(appliedCoupon.discount_amount || 0).toLocaleString('en-IN')} Discount` /* v332: Indian format */}
          </span>
        </div>
      )}

      <div className="flex justify-between items-center mb-3">
        <span className="text-[var(--text-secondary)]">{feeLabel} ({feeDetails.feePercent}%)</span>
        <span className="text-[var(--text-primary)]">
          {feeDetails.platformFee === 0 ? (
            <span className="text-[#027A48] font-semibold">₹0 (Zero Fee)</span>
          ) : (
            `₹${formatAmount(feeDetails.platformFee)}`
          )}
        </span>
      </div>

      {feeDetails.gstAmount > 0 && (
        <div className="flex justify-between items-center mb-3">
          <span className="text-[var(--text-secondary)]">GST on fee</span>
          <span className="text-[var(--text-primary)]">₹{formatAmount(feeDetails.gstAmount)}</span>
        </div>
      )}

      <div className="flex justify-between items-center mb-3">
        <span className="text-[var(--text-secondary)]">Ybex Secure Payment Hold Guarantee</span>
        <span className="text-emerald-400 font-semibold text-xs">✓ Included (100% Secured)</span>
      </div>
      <div className="flex justify-between items-center pb-3 border-b border-[var(--border-default)]">
        <span className="text-[var(--text-secondary)]">Payment Processing</span>
        <span className="text-emerald-400 font-semibold text-xs">Instant Settlement</span>
      </div>
      <div className="flex justify-between items-center pt-1">
        <span className="font-bold text-[var(--text-primary)]">Creator Receives</span>
        <span className="font-display text-[var(--violet)] font-bold text-lg tracking-tight">₹{formatAmount(feeDetails.creatorNet)}</span>
      </div>
    </div>
  );
}

