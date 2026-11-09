export type SignupInput = { shopName: string; ownerName: string; phone: string; email: string; password: string; website?: string };

export const TRIAL_DAYS = 14;

export function validateSignup(d: SignupInput): SignupInput {
  if (!d.shopName?.trim() || d.shopName.trim().length > 80) throw new Error("Enter your shop name");
  if (!d.ownerName?.trim() || d.ownerName.trim().length > 80) throw new Error("Enter your name");
  if (!/^\+?[0-9 ]{7,20}$/.test(d.phone?.trim() ?? "")) throw new Error("Enter a valid phone number");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email?.trim() ?? "") || d.email.length > 120) throw new Error("Enter a valid email");
  if (!d.password || d.password.length < 8) throw new Error("Password must be at least 8 characters");
  return d;
}

/** Days left in a trial; 0 once ended. */
export function trialDaysLeft(endsAt: string, now = new Date()) {
  return Math.max(0, Math.ceil((Date.parse(endsAt) - now.getTime()) / 86400000));
}
