import { z } from "zod";

/** Only company mailboxes may open an account. Override for a rename/test tenant. */
export const COMPANY_DOMAIN = (process.env.SIGNUP_EMAIL_DOMAIN || "powerline.com.eg").trim().toLowerCase();

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");

/**
 * Compared against the part after the LAST "@" and required to match exactly —
 * a suffix test would accept "outsider@evil.com@powerline.com.eg", and a
 * contains test would accept "powerline.com.eg.attacker.net".
 */
const isCompanyAddress = (value: string): boolean => {
  const at = value.lastIndexOf("@");
  if (at <= 0) return false;
  return value.slice(at + 1) === COMPANY_DOMAIN;
};

/** The address rule for opening an account (sign-in and reset are unrestricted,
 *  so anyone who already has an account keeps working). */
const companyEmail = email.refine(isCompanyAddress, {
  message: `Sign-up is limited to @${COMPANY_DOMAIN} addresses. Please use your company email.`,
});
const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200);
const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.");
const name = z.string().trim().max(120).optional();

// Every step of the sign-up path is gated, not just the first — the later calls
// take the address from the request body, so checking only /register would let
// someone skip straight to /complete with an outside address.
export const registerSchema = z.object({ email: companyEmail });
export const verifySchema = z.object({ email: companyEmail, code });
export const completeSchema = z.object({ email: companyEmail, code, password, name });
export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ email, code, password });
