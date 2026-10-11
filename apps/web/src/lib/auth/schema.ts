import { z } from "zod";

export const emailSchema = z.string().trim().email("Enter a valid email address.").transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.")
  .regex(/[^A-Za-z0-9]/, "Include at least one special character.");

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.") });
export const resetPasswordSchema = z.object({ password: passwordSchema, confirmPassword: z.string() }).refine((value) => value.password === value.confirmPassword, { message: "Passwords must match.", path: ["confirmPassword"] });
