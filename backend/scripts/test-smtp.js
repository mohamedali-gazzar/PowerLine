/**
 * Verify the SMTP configuration end to end.
 *
 *   node scripts/test-smtp.js                 → verify the connection + login only
 *   node scripts/test-smtp.js you@example.com → also send one real test message
 *
 * Reads the same SMTP_* variables the app does, so a pass here means the app can
 * send mail. Prints the provider's actual error on failure — which is the part the
 * application layer swallows.
 */
require("dotenv").config();
const nodemailer = require("nodemailer");

const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const port = parseInt(process.env.SMTP_PORT || "587", 10);
const secure = process.env.SMTP_SECURE === "true";
const from = process.env.SMTP_FROM || user || "no-reply@powerline.com.eg";

const mask = (v) => (v ? `${v.slice(0, 2)}${"*".repeat(Math.max(0, v.length - 4))}${v.slice(-2)}` : "(unset)");

console.log("SMTP configuration");
console.log("  SMTP_HOST  :", host || "(unset)");
console.log("  SMTP_PORT  :", port, secure ? "(implicit TLS)" : "(STARTTLS)");
console.log("  SMTP_SECURE:", process.env.SMTP_SECURE ?? "(unset)", secure ? "" : "— anything but the exact string \"true\" means false");
console.log("  SMTP_USER  :", user || "(unset)");
console.log("  SMTP_PASS  :", mask(pass));
console.log("  SMTP_FROM  :", from);
console.log("");

const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`FAIL — missing: ${missing.join(", ")}. The app treats this as "email disabled".`);
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
});

(async () => {
  try {
    process.stdout.write("Connecting and authenticating… ");
    await transporter.verify();
    console.log("OK — the server accepted these credentials.");
  } catch (e) {
    console.log("FAILED");
    console.error("\n" + (e && e.message ? e.message : e));
    if (/Invalid login|Username and Password not accepted|BadCredentials/i.test(String(e && e.message))) {
      console.error(
        "\nGoogle rejects the login when:\n" +
          "  • the value is the account password rather than a 16-character App Password\n" +
          "  • 2-Step Verification is off (App Passwords need it enabled)\n" +
          "  • the App Password belongs to a different account than SMTP_USER"
      );
    }
    if (/timeout|ETIMEDOUT|ECONNREFUSED/i.test(String(e && e.message))) {
      console.error("\nCouldn't reach the server — check SMTP_HOST/SMTP_PORT and any network egress rules.");
    }
    process.exit(1);
  }

  const to = process.argv[2];
  if (!to) {
    console.log("\nNo recipient given — connection verified, nothing sent.");
    console.log("Send a real test with:  node scripts/test-smtp.js you@example.com");
    return;
  }

  try {
    process.stdout.write(`Sending a test message to ${to}… `);
    const info = await transporter.sendMail({
      from,
      to,
      subject: "PowerLine SMTP test",
      text: "If you're reading this, PowerLine can send email. Verification and password-reset codes will arrive from this address.",
      html:
        '<div style="font-family:Segoe UI,Arial,sans-serif"><h2 style="color:#F16722;margin:0 0 8px">PowerLine SMTP test</h2>' +
        "<p>If you're reading this, PowerLine can send email. Verification and password-reset codes will arrive from this address.</p></div>",
    });
    console.log("OK");
    console.log("  messageId:", info.messageId);
    console.log("  accepted :", info.accepted.join(", ") || "(none)");
    if (info.rejected && info.rejected.length) console.log("  REJECTED :", info.rejected.join(", "));
    console.log("\nCheck the inbox (and spam). Note the From address is", from);
  } catch (e) {
    console.log("FAILED");
    console.error("\n" + (e && e.message ? e.message : e));
    process.exit(1);
  }
})();
