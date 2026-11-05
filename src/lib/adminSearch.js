// v396 (Ravi): what the admin search box can find. Pure functions — tested in src/v396AdminFixes.test.js.
// Sections = the left menu; settings = the Platform Settings tabs (with the words people type for them).

export const ADMIN_SECTIONS = [
  { id: "dashboard", title: "Overview", words: "home dashboard stats analytics overview", to: "/admin?tab=dashboard" },
  { id: "users", title: "All users", words: "users accounts people members", to: "/admin?tab=users&role=all" },
  { id: "creators", title: "Creators", words: "creators influencers creator directory", to: "/admin?tab=users&role=creator" },
  { id: "brands", title: "Brands", words: "brands companies brand directory", to: "/admin?tab=users&role=brand" },
  { id: "agencies", title: "Agencies", words: "agencies agency", to: "/admin?tab=users&role=agency" },
  { id: "unclaimed", title: "Unclaimed creators", words: "unclaimed shadow profiles", to: "/admin?tab=users&role=unclaimed" },
  { id: "admins", title: "Admins & sub-admins", words: "admins sub admin team staff permissions", to: "/admin?tab=users&role=admin" },
  { id: "bin", title: "Recycle bin (deleted accounts)", words: "bin deleted restore recycle", to: "/admin?tab=users&role=deleted" },
  { id: "waitlist", title: "Waitlist (approve creators)", words: "waitlist approve approvals pending applications reject review", to: "/admin?tab=waitlist" },
  { id: "min-followers", title: "Minimum followers to join", words: "minimum followers limit 500 follower lock gate low followers work link creator sign-up signup", to: "/admin?tab=settings&view=signup" }, // v397
  { id: "kyc", title: "KYC checks", words: "kyc verification pan documents identity verify", to: "/admin?tab=verifications" },
  { id: "campaigns", title: "Campaigns (review queue)", words: "campaigns campaign review queue approve brand campaigns", to: "/admin?tab=campaigns" },
  { id: "pitches", title: "Pitch leads", words: "pitch leads pitches", to: "/admin?tab=pitches" },
  { id: "challenge", title: "Challenge entries (Diwali)", words: "challenge diwali entries contest reels winners recharge", to: "/admin?tab=challenge" },
  { id: "chat", title: "Chat moderation", words: "chat moderation messages flagged", to: "/admin?tab=chat" },
  { id: "reports", title: "System reports", words: "reports system errors issues complaints", to: "/admin?tab=reports" },
  { id: "payments", title: "Payments & payouts (escrow)", words: "payments payouts escrow money refunds transactions settlement", to: "/admin?tab=escrow" },
  { id: "ugc", title: "UGC orders", words: "ugc orders briefs videos ugc refunds", to: "/admin?tab=ugc-orders" },
  { id: "logs", title: "Activity logs", words: "logs activity audit history active logs", to: "/admin?tab=activity-logs" },
  { id: "blog", title: "Blogs & content", words: "blog blogs articles content posts seo", to: "/admin?tab=blog" },
  { id: "push", title: "Push notifications", words: "push notifications notification send phones", to: "/admin?tab=push" },
  { id: "helpdesk", title: "Help desk (support tickets)", words: "help desk support tickets helpdesk", to: "/admin?tab=helpdesk" },
  { id: "feedback", title: "Eva feedback", words: "eva chatbot feedback bot", to: "/admin?tab=feedback" },
  { id: "settings", title: "Platform settings", words: "settings platform tools config", to: "/admin?tab=settings" },
];

export const ADMIN_SETTINGS = [
  { id: "broadcast", title: "Email broadcast", words: "email broadcast newsletter resend mail send email", to: "/admin?tab=settings&view=broadcast" },
  { id: "maintenance", title: "Maintenance mode", words: "maintenance down offline mode", to: "/admin?tab=settings&view=maintenance" },
  { id: "fees", title: "Fees & risk controls", words: "fees fee commission gst payout freeze withdrawal budget split brand fee creator fee", to: "/admin?tab=settings&view=fees" },
  { id: "coupons", title: "Coupons", words: "coupons coupon promo code discount", to: "/admin?tab=settings&view=coupons" },
  { id: "referrals", title: "Referral program", words: "referral referrals invite rewards wallet", to: "/admin?tab=settings&view=referrals" },
  { id: "whats-new", title: "What's new messages", words: "whats new version update message release notes", to: "/admin?tab=settings&view=whats-new" },
  { id: "promos", title: "Promo popups", words: "popup popups promo poster pop up", to: "/admin?tab=settings&view=promos" },
  { id: "banners", title: "Banners", words: "banners banner home poster", to: "/admin?tab=settings&view=banners" },
  { id: "landing", title: "Landing page content", words: "landing page homepage website reviews brands logos", to: "/admin?tab=settings&view=landing" },
  { id: "speed", title: "Speed report", words: "speed slow performance api report", to: "/admin?tab=settings&view=speed" },
];

const low = (v) => String(v ?? "").toLowerCase();
const has = (hay, q) => low(hay).includes(q);

/** Pure: score 0 (no match) … 3 (starts with). */
function score(fields, q) {
  let best = 0;
  for (const f of fields) {
    const s = low(f);
    if (!s) continue;
    if (s === q) return 4;
    if (s.startsWith(q)) best = Math.max(best, 3);
    else if (s.split(/[\s@._-]+/).some((w) => w.startsWith(q))) best = Math.max(best, 2);
    else if (s.includes(q)) best = Math.max(best, 1);
  }
  return best;
}

/** Pure: kind of a user row from /admin/users. */
export function userKind(u) {
  if (!u) return "creator";
  if (u.role === "admin" || u.team_role === "sub_admin" || u.role === "sub_admin") return "admin";
  if (u.role === "brand") return (u.is_agency === true || u.brand_profile?.is_agency === true) ? "agency" : "brand";
  const unclaimed = u.is_unclaimed === true || u.auth_method === "unclaimed" || u.creator_profile?.is_claimed === false;
  return unclaimed ? "unclaimed" : "creator";
}

/** Pure: results for the box. `data` = { users, waitlist, campaigns } (may be null while loading). Max ~24. */
export function searchAdmin(query, data) {
  const q = low(query).trim().replace(/^@/, "");
  if (!q) return [];
  const out = [];
  const pushStatic = (list, kind) => {
    for (const it of list) {
      const s = Math.max(score([it.title], q), has(it.words, q) ? 2 : 0);
      if (s) out.push({ kind, id: it.id, title: it.title, sub: kind === "setting" ? "Platform settings" : "Open section", to: it.to, s: s + 0.5 });
    }
  };
  pushStatic(ADMIN_SECTIONS, "section");
  pushStatic(ADMIN_SETTINGS, "setting");
  if (q.length >= 2 && data) {
    const people = [];
    for (const u of data.users || []) {
      if (!u || u.is_deleted) continue;
      const cp = u.creator_profile || {}, bp = u.brand_profile || {};
      const name = u.role === "brand" ? (bp.company_name || u.brand_setup?.company_name || u.name) : (u.name || cp.name);
      const handle = cp.instagram_handle || bp.instagram_handle || "";
      const s = score([name, u.name, u.email, handle, u.phone || cp.phone || bp.phone, u.user_id], q);
      if (!s) continue;
      const kind = userKind(u);
      const followers = Number(cp.followers_instagram || cp.followers || 0);
      people.push({ kind, id: u.user_id, title: name || u.email || "Account", photo: u.picture || cp.photo || bp.logo || "",
        sub: [u.email, handle ? `@${String(handle).replace(/^@/, "")}` : "", followers ? `${followers.toLocaleString("en-IN")} followers` : "", cp.city || bp.city].filter(Boolean).join(" · "),
        to: `/admin?tab=users&role=all&open=${encodeURIComponent(u.user_id)}`, s });
    }
    people.sort((a, b) => b.s - a.s);
    out.push(...people.slice(0, 10));
    const wl = [];
    for (const w of data.waitlist || []) {
      if (!w || String(w.status || "").toLowerCase() === "approved") continue; // approved people are under Users
      const handle = w.social_handle || w.handle || "";
      const s = score([w.name, w.email, handle, w.company_name, w.phone || w.mobile], q);
      if (!s) continue;
      const key = w.email || handle || w.name || "";
      wl.push({ kind: "waitlist", id: w.id, title: w.name || w.company_name || handle || "Applicant",
        sub: [String(w.status || "Pending"), handle ? `@${String(handle).replace(/^@/, "")}` : "", w.followers ? `${Number(w.followers).toLocaleString("en-IN")} followers` : "", w.city].filter(Boolean).join(" · "),
        to: `/admin?tab=waitlist&q=${encodeURIComponent(key)}`, s: s - 0.2 });
    }
    wl.sort((a, b) => b.s - a.s);
    out.push(...wl.slice(0, 6));
    const camps = [];
    for (const c of data.campaigns || []) {
      const s = score([c.title, c.brand_name, c.campaign_id], q);
      if (!s) continue;
      camps.push({ kind: "campaign", id: c.campaign_id || c.id, title: c.title || "Campaign", sub: [c.brand_name, c.status || c.stage].filter(Boolean).join(" · "),
        to: `/admin?tab=campaigns&open=${encodeURIComponent(c.campaign_id || c.id)}`, s: s - 0.3 });
    }
    camps.sort((a, b) => b.s - a.s);
    out.push(...camps.slice(0, 6));
  }
  // best matches first, sections/settings win ties
  return out.sort((a, b) => b.s - a.s).slice(0, 24);
}
