// Pluggable email. When SMTP_* env vars are set, real mail is sent via nodemailer.
// Otherwise (dev / not configured) the message is logged to the console and the
// auth controllers additionally return the code in the API response (clearly
// marked dev-only) so the whole flow is testable without an email provider.
import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;

export const emailConfigured = Boolean(host && user);

const transporter = emailConfigured
  ? nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass: process.env.SMTP_PASS },
    })
  : null;

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  if (transporter) {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || user || "no-reply@powerline.com.eg",
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return;
  }
  // Dev stub — no SMTP configured.
  console.log(
    `\n──────── [email dev-stub] ────────\n To: ${opts.to}\n Subject: ${opts.subject}\n ${opts.text}\n──────────────────────────────────\n`
  );
}
