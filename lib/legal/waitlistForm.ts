import { companyFieldError, consentError, dotFieldError, emailFieldError, roleFieldError } from "@/lib/legal/copy";

export type WaitlistField = "email" | "company" | "role" | "dot" | "consent";

export type WaitlistFieldInput = {
  email: string;
  company: string;
  role: string;
  dotWork: string;
  consent: boolean;
};

/** One message per missing required field. Product updates stay optional. */
export function waitlistFieldErrors(input: WaitlistFieldInput): Partial<Record<WaitlistField, string>> {
  const errors: Partial<Record<WaitlistField, string>> = {};
  if (!input.email.trim()) errors.email = emailFieldError;
  if (!input.company.trim()) errors.company = companyFieldError;
  if (!input.role.trim()) errors.role = roleFieldError;
  if (input.dotWork !== "yes" && input.dotWork !== "no") errors.dot = dotFieldError;
  if (!input.consent) errors.consent = consentError;
  return errors;
}
