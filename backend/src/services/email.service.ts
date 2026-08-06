// Pluggable email. When SMTP_* env vars are set, real mail is sent via nodemailer.
// Otherwise (dev / not configured) the message is logged to the console and the
// auth controllers additionally return the code in the API response (clearly
// marked dev-only) so the whole flow is testable without an email provider.
//
// IMPORTANT: every value below is read at MODULE LOAD. Changing an SMTP_* variable
// has no effect until the process (or the serverless lambda) is recycled — which is
// why an env change always needs a redeploy, never just a save.
import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

// SMTP_PASS is part of the predicate on purpose. With only HOST+USER set, a
// transporter was still built with `pass: undefined`, every send threw, and the
// caller turned that into a generic 500 — after the one-time code had already been
// written to the database. Treating a partial configuration as "not configured"
// keeps the failure in one place instead of two.
export const emailConfigured = Boolean(host && user && pass);

// Say so at boot rather than at 2am. A half-filled configuration is the failure
// mode that looks like it works.
if (!emailConfigured && (host || user || pass)) {
  console.warn(
    "[email] SMTP is only PARTIALLY configured — need SMTP_HOST, SMTP_USER and SMTP_PASS. " +
      `Have: host=${host ? "yes" : "NO"} user=${user ? "yes" : "NO"} pass=${pass ? "yes" : "NO"}. ` +
      "Mail is DISABLED."
  );
}

const transporter = emailConfigured
  ? nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      // Strict compare: only the exact string "true" enables implicit TLS. Port 465
      // needs BOTH SMTP_PORT=465 and SMTP_SECURE=true.
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass },
    })
  : null;

/** The address mail actually goes out as — used in copy so nobody has to guess. */
export const emailFrom = process.env.SMTP_FROM || user || "no-reply@powerline.com.eg";

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  if (transporter) {
    await transporter.sendMail({
      from: emailFrom,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return;
  }
  // No SMTP. In production this used to log the message — including one-time
  // sign-up and password-reset codes, in cleartext — and then return normally, so
  // the API reported success for mail that was never sent and the codes sat in the
  // platform logs. Fail loudly instead: a 500 with a real reason is far easier to
  // diagnose than a silent success, and no secret is written anywhere.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Email is not configured (set SMTP_HOST, SMTP_USER and SMTP_PASS) — cannot send mail."
    );
  }
  // Dev stub — no SMTP configured.
  console.log(
    `\n──────── [email dev-stub] ────────\n To: ${opts.to}\n Subject: ${opts.subject}\n ${opts.text}\n──────────────────────────────────\n`
  );
}

// ── Branded HTML ─────────────────────────────────────────────────────────────
// The first HTML template in the backend; every message before this was plain
// text. Inline styles only — mail clients drop <style> blocks and external CSS.

const BRAND = "#F16722";
const INK = "#20262f";

const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );

/** Wrap body HTML in the PowerLine shell. `body` is trusted — escape at the call site. */
export function emailShell(heading: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e6e6ea">
    <tr><td style="background:${BRAND};padding:16px 24px">
      <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-0.3px">PowerLine</span>
    </td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:19px;font-weight:800;color:${INK}">${esc(heading)}</h1>
      ${bodyHtml}
    </td></tr>
    <tr><td style="padding:14px 24px;background:#fafafa;border-top:1px solid #eee;font-size:11px;color:#8b8f98">
      Sent by the PowerLine Offer Configurator. If you weren't expecting this, you can ignore it.
    </td></tr>
  </table></body></html>`;
}

/** A big, selectable one-time code. */
export function emailCodeBlock(code: string): string {
  return `<p style="margin:0 0 8px;font-size:14px;line-height:1.55">Your verification code is:</p>
  <p style="margin:0 0 16px;font-size:30px;font-weight:800;letter-spacing:6px;color:${BRAND}">${esc(code)}</p>`;
}

/** A labelled detail table — used by the QTN workflow notifications. */
export function emailRows(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;font-size:13px">${rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#8b8f98;white-space:nowrap;vertical-align:top">${esc(
          k
        )}</td><td style="padding:4px 0;font-weight:600;color:${INK}">${esc(v)}</td></tr>`
    )
    .join("")}</table>`;
}

/** The brand-orange call-to-action button. */
export function emailButton(href: string, label: string): string {
  return `<p style="margin:0"><a href="${esc(href)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:8px">${esc(
    label
  )}</a></p>`;
}

/**
 * Absolute URL for a link inside an e-mail.
 *
 * A relative path is useless in an inbox — there is no page for the mail client to
 * resolve it against, so the button simply does nothing. `fallbackOrigin` is the
 * address the request itself arrived on, which means links work with no
 * configuration at all; APP_URL still wins when it is set (useful behind a proxy
 * or a custom domain).
 */
export function appUrl(path: string, fallbackOrigin?: string): string {
  const configured = (process.env.APP_URL || process.env.CORS_ORIGIN || "").split(",")[0].trim();
  const base = configured || (fallbackOrigin ?? "").trim();
  const tail = path.startsWith("/") ? path : `/${path}`;
  if (!/^https?:\/\//i.test(base)) {
    console.warn(
      "[email] no absolute site address available — the link in this e-mail will not open. " +
        "Set APP_URL to the site's URL."
    );
    return tail;
  }
  return `${base.replace(/\/+$/, "")}${tail}`;
}

/** The origin this request arrived on, honouring the proxy headers Vercel sets. */
export function originOf(req: {
  headers: Record<string, unknown>;
  protocol?: string;
}): string {
  const h = (k: string) => {
    const v = req.headers?.[k];
    return (Array.isArray(v) ? v[0] : v) as string | undefined;
  };
  const host = h("x-forwarded-host") || h("host");
  if (!host) return "";
  const proto = h("x-forwarded-proto") || req.protocol || "https";
  return `${String(proto).split(",")[0].trim()}://${String(host).split(",")[0].trim()}`;
}
