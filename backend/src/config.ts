// One place that decides "are we in production?", and one place that states what every
// environment variable is for.
//
// WHY THIS EXISTS. Five separate security controls each read `process.env.NODE_ENV`
// directly, and every one of them FAILS OPEN when it is absent or misspelled:
//
//   lib/auth.ts               a missing JWT_SECRET falls back to a hardcoded dev secret,
//                             so anyone who reads this repo can forge a session token
//   controllers/auth.ctrl     POST /api/auth/dev-login mints a token for the oldest
//                             account — a complete authentication bypass
//   controllers/auth.ctrl     one-time sign-up / reset codes are echoed in the response
//   app.ts                    CORS falls back to "*", allowing any site to call the API
//   services/email.service    mail failures are logged (with codes) and reported as sent
//
// One unset variable therefore opens all five at once. `IS_PROD` below also trusts
// `VERCEL`, which the platform injects itself and nobody can forget or typo — the build
// scripts already rely on it for exactly this reason (scripts/db-setup.js,
// scripts/db-push-vercel.js). Being wrong in the safe direction costs a developer a
// clearer error locally; being wrong in the unsafe direction costs the company its data.

/**
 * True when this process is serving real users.
 *
 * Deliberately true if EITHER signal says so, so a missing or misspelled NODE_ENV can
 * never quietly re-open a dev-only door on a deployed instance.
 */
export const IS_PROD =
  process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

/** True only for local development. The inverse of IS_PROD, named for readability. */
export const IS_DEV = !IS_PROD;

/**
 * Every environment variable the backend reads, what it does, and what happens when it is
 * missing. Kept as data so `describeConfig()` can report it and so there is a single
 * answer to "what do I have to set?".
 *
 * Values are NEVER included — only whether something is present.
 */
export const ENV_VARS = [
  {
    name: "DATABASE_URL",
    required: true,
    purpose: "Database connection. SQLite locally, the pooled Neon URL in production.",
    ifMissing: "Every request that touches the database fails.",
  },
  {
    name: "DIRECT_URL",
    required: false,
    purpose: "Neon direct (unpooled) URL, used for schema pushes during deploy.",
    ifMissing: "Deploy-time schema sync may fail; requests are unaffected.",
  },
  {
    name: "JWT_SECRET",
    required: true,
    purpose: "Signs the 30-day session tokens.",
    ifMissing: "Refuses to start in production. Locally, falls back to a known dev secret.",
  },
  {
    name: "PORT",
    required: false,
    purpose: "Local server port (default 4000). Ignored on serverless.",
    ifMissing: "Defaults to 4000.",
  },
  {
    name: "CORS_ORIGIN",
    required: false,
    purpose: "Comma-separated allowlist of browser origins that may call the API.",
    ifMissing:
      "Production allows same-origin only, which is correct while the app is served from one domain. Add it if the frontend ever moves to its own domain.",
  },
  {
    name: "APP_URL",
    required: false,
    purpose: "Absolute base URL used for links inside notification e-mails.",
    ifMissing: "Falls back to CORS_ORIGIN, then to the request's own host headers.",
  },
  {
    name: "SIGNUP_EMAIL_DOMAIN",
    required: false,
    purpose: "The single e-mail domain allowed to open an account.",
    ifMissing: "Defaults to powerline.com.eg.",
  },
  {
    name: "OTP_TTL_MINUTES",
    required: false,
    purpose: "How long a one-time sign-up / reset code stays valid.",
    ifMissing: "Defaults to 10 minutes.",
  },
  {
    name: "PRICE_BOOK_TTL_MS",
    required: false,
    purpose: "How long the in-process price-book cache is trusted before re-reading.",
    ifMissing: "Defaults to the value in domain/pricing-data.ts.",
  },
  {
    name: "SMTP_HOST",
    required: false,
    purpose: "Mail server. Required together with SMTP_USER and SMTP_PASS to send e-mail.",
    ifMissing:
      "In production, sending raises a visible error. Locally, codes are logged to the console so the flow stays testable.",
  },
  { name: "SMTP_PORT", required: false, purpose: "Mail server port.", ifMissing: "Defaults to 587." },
  {
    name: "SMTP_SECURE",
    required: false,
    purpose: 'Implicit TLS. The exact string "true" enables it; port 465 needs both.',
    ifMissing: "Defaults to false (STARTTLS on 587).",
  },
  { name: "SMTP_USER", required: false, purpose: "Mail account.", ifMissing: "See SMTP_HOST." },
  { name: "SMTP_PASS", required: false, purpose: "Mail password / app password.", ifMissing: "See SMTP_HOST." },
  { name: "SMTP_FROM", required: false, purpose: "From: header.", ifMissing: "Falls back to SMTP_USER." },
] as const;

/** Names of variables that must be present in production. */
const REQUIRED_IN_PROD = ENV_VARS.filter((v) => v.required).map((v) => v.name);

/**
 * Validate configuration once, at startup.
 *
 * Returns the problems rather than throwing, so the caller decides: the long-running
 * local server logs and continues, while production refuses to boot on a missing secret
 * instead of running insecurely. Never logs a value.
 */
export function checkConfig(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const name of REQUIRED_IN_PROD) {
    if (!process.env[name]) {
      (IS_PROD ? errors : warnings).push(`${name} is not set.`);
    }
  }

  // Mail is all-or-nothing: a partial configuration silently disables sending.
  const mail = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
  const mailSet = mail.filter((n) => process.env[n]);
  if (mailSet.length > 0 && mailSet.length < mail.length) {
    const missing = mail.filter((n) => !process.env[n]).join(", ");
    warnings.push(
      `E-mail is partly configured (${missing} missing), so sending is DISABLED. ` +
        `Sign-up, password reset and workflow notifications will not send.`,
    );
  } else if (mailSet.length === 0 && IS_PROD) {
    warnings.push(
      "No SMTP configuration, so sign-up, password reset and workflow notifications cannot send.",
    );
  }

  // APP_URL must be an absolute URL or e-mail links land nowhere.
  const appUrl = process.env.APP_URL;
  if (appUrl && !/^https?:\/\/[^/]+$/.test(appUrl.replace(/\/+$/, ""))) {
    warnings.push(
      `APP_URL ("${appUrl}") should be a bare absolute URL such as https://example.com ` +
        `— no path, no trailing slash — or the "Open the quotation" link in e-mails breaks.`,
    );
  }

  return { errors, warnings };
}

/** A one-line-per-variable report of what is set. Presence only, never values. */
export function describeConfig(): string {
  const rows = ENV_VARS.map((v) => {
    const set = Boolean(process.env[v.name]);
    const flag = set ? "set" : v.required ? "MISSING (required)" : "unset";
    return `  ${v.name.padEnd(22)} ${flag}`;
  });
  return [`config: ${IS_PROD ? "production" : "development"}`, ...rows].join("\n");
}
