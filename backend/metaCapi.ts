// v395 (Ravi, 2 Nov 2026): Meta event "QualifiedCreator" — a creator whose Instagram has 1,000+ followers.
// CompleteRegistration fires for every signup (including 0-follower accounts), so Meta was finding the wrong people.
// This event is sent twice, with the SAME event id, so Meta counts it once:
//   • Pixel (browser): the server puts `meta_event` in the answer of the call that learned the follower count
//     (Instagram lookup, onboarding); src/lib/api.js fires fbq("trackCustom", "QualifiedCreator", …, { eventID }).
//   • Conversions API (server): sent from here, with hashed email / phone, fbp / fbc cookies, IP and browser.
// It fires once per creator (ybex_ephemeral key, 400 days; the fixed event id also lets Meta drop a repeat) and only for
// accounts made in the last 30 days (old creators refreshing their numbers are not new leads).
// Server settings (YBEX_ENV): META_CAPI_ACCESS_TOKEN (Events Manager → Pixel → Settings → Conversions API → Generate access token),
// optional META_PIXEL_ID (default = the Pixel in src/lib/metaPixel.js), META_TEST_EVENT_CODE (Test events tab), META_GRAPH_VERSION.
// Without the token only the Pixel half is sent. Never throws; never logs the token.
import crypto from "crypto";
import { ephemeralGet, ephemeralSet } from "./ephemeralStore";
import { clientIp } from "./authSecurity";

export const QUALIFIED_MIN_FOLLOWERS = 1000;
export const QUALIFIED_EVENT = "QualifiedCreator";
const DEFAULT_PIXEL_ID = "965515649959745";
const NEW_ACCOUNT_DAYS = 30;

const env = (k: string) => String(process.env[k] || "").replace(/^["']|["']$/g, "").trim();
const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

/** Meta wants lower-case trimmed e-mail and digits-only phone with country code, both SHA-256. */
export function hashEmail(email: any): string | null {
  const e = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? sha256(e) : null;
}
export function hashPhone(phone: any): string | null {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) d = "91" + d;
  if (d.length === 11 && d.startsWith("0")) d = "91" + d.slice(1);
  return d.length >= 11 && d.length <= 15 ? sha256(d) : null;
}
export const qualifiedEventId = (userId: string) => `qc_${userId}`;

function cookie(req: any, name: string): string {
  const raw = String(req?.headers?.cookie || "");
  const m = raw.split(/;\s*/).find((p) => p.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)).slice(0, 200) : "";
}

/** Builds the Conversions API body (exported for the test). */
export function buildQualifiedPayload(o: { user: any; followers: number; eventId: string; req?: any; now?: number; testCode?: string }) {
  const u = o.user || {};
  const ud: any = {};
  const em = hashEmail(u.email); if (em) ud.em = [em];
  const ph = hashPhone(u.phone); if (ph) ud.ph = [ph];
  if (u.user_id) ud.external_id = [sha256(String(u.user_id))];
  const fbp = cookie(o.req, "_fbp"); if (fbp) ud.fbp = fbp;
  const fbc = cookie(o.req, "_fbc"); if (fbc) ud.fbc = fbc;
  if (o.req) {
    try { const ip = clientIp(o.req); if (ip) ud.client_ip_address = ip; } catch { /* no ip */ }
    const ua = String(o.req.headers?.["user-agent"] || ""); if (ua) ud.client_user_agent = ua.slice(0, 300);
  }
  const ref = String(o.req?.headers?.referer || o.req?.headers?.referrer || "");
  const body: any = {
    data: [{
      event_name: QUALIFIED_EVENT,
      event_time: Math.floor((o.now ?? Date.now()) / 1000),
      event_id: o.eventId,
      action_source: "website",
      ...(/^https:\/\/[^\s]+$/.test(ref) ? { event_source_url: ref.slice(0, 300) } : {}),
      user_data: ud,
      custom_data: { value: o.followers, currency: "INR", followers_count: o.followers, content_name: "creator" },
    }],
  };
  if (o.testCode) body.test_event_code = o.testCode;
  return body;
}

/** Sends one Conversions API event. Returns true when Meta accepted it. */
export async function sendCapiEvent(body: any, fetchImpl: any = (globalThis as any).fetch): Promise<boolean> {
  const token = env("META_CAPI_ACCESS_TOKEN");
  if (!token || !fetchImpl) return false;
  const pixel = env("META_PIXEL_ID") || DEFAULT_PIXEL_ID;
  const ver = env("META_GRAPH_VERSION") || "v21.0";
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetchImpl(`https://graph.facebook.com/${ver}/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) { console.warn("[meta-capi] rejected:", r.status, String(await r.text().catch(() => "")).slice(0, 200).replace(token, "***")); return false; }
    return true;
  } catch (e: any) { console.warn("[meta-capi] not sent:", String(e?.message || e).replace(token, "***")); return false; }
}

/**
 * Call whenever a creator's Instagram follower count becomes known. Returns `{ name, event_id, followers }` the FIRST time a
 * new creator reaches 1,000+ (the browser then fires the Pixel half), otherwise null. Never throws.
 */
export async function qualifyCreator(o: { user: any; followers: any; req?: any; getUser?: () => Promise<any> }): Promise<{ name: string; event_id: string; followers: number } | null> {
  try {
    const followers = Math.round(Number(o.followers) || 0);
    if (followers < QUALIFIED_MIN_FOLLOWERS) return null;
    let user = o.user;
    if (user && !user.email && o.getUser) user = (await o.getUser()) || user;
    if (!user?.user_id || String(user.role || "").toLowerCase() !== "creator") return null;
    const created = Date.parse(String(user.created_at || ""));
    if (Number.isFinite(created) && Date.now() - created > NEW_ACCOUNT_DAYS * 86400e3) return null;
    const key = `metaqc:${user.user_id}`;
    if (await ephemeralGet(key)) return null;
    await ephemeralSet(key, { followers, at: Date.now() }, 400 * 86400e3);
    const eventId = qualifiedEventId(String(user.user_id));
    void sendCapiEvent(buildQualifiedPayload({ user, followers, eventId, req: o.req, testCode: env("META_TEST_EVENT_CODE") }));
    return { name: QUALIFIED_EVENT, event_id: eventId, followers };
  } catch (e: any) { console.warn("[meta-capi] qualify skipped:", e?.message || e); return null; }
}
