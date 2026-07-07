// Cloudflare Pages Function for the founding-member waitlist (replaces the dead
// Netlify Forms handler after the move to Cloudflare Pages). Route: POST
// /founding-member. Accepts either urlencoded/multipart form posts (progressive
// enhancement / native submit) or JSON. Bots are dropped via the bot-field
// honeypot; emails are validated and stored in the WAITLIST KV namespace. If KV
// is not yet bound it degrades to 503 (never 500) so the failure is diagnosable.
export async function onRequestPost({ request, env }) {
  const ct = request.headers.get("content-type") || "";
  let email = "", lang = "", bot = "";
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await request.formData();
    email = (form.get("email") || "").toString().trim();
    lang = (form.get("lang") || "").toString().trim();
    bot = (form.get("bot-field") || "").toString().trim();
  } else {
    try { const j = await request.json(); email = (j.email||"").trim(); lang = (j.lang||"").trim(); bot = (j.bot_field||"").trim(); } catch {}
  }
  // Honeypot hit: pretend success, do not store (silently drop the bot).
  if (bot) return Response.json({ ok: true });
  // Email validation.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  // Graceful degradation when KV is not yet bound: 503, not 500, and diagnosable.
  if (!env.WAITLIST) return Response.json({ ok: false, error: "kv_unbound" }, { status: 503 });
  const ts = new Date().toISOString();
  // Idempotent per email: the key is the address itself (no timestamp), so the
  // same person re-submitting overwrites their own entry instead of piling up —
  // one address can't flood the limited founding-member seats.
  const key = `wl:${email.toLowerCase()}`;
  try {
    // Store only what we need to notify at launch: email, language, timestamp.
    // No referer / no PII-adjacent data — trust by architecture, store the least.
    await env.WAITLIST.put(key, JSON.stringify({ email, lang: lang || "unknown", ts }));
  } catch {
    // Degrade like kv_unbound — never surface a 500.
    return Response.json({ ok: false, error: "kv_write_failed" }, { status: 503 });
  }
  return Response.json({ ok: true });
}
