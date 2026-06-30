import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200);
const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.");
const name = z.string().trim().max(120).optional();

export const registerSchema = z.object({ email });
export const verifySchema = z.object({ email, code });
export const completeSchema = z.object({ email, code, password, name });
export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ email, code, password });
