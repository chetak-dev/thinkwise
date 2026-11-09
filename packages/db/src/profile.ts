import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { GENDER_VALUES } from '@thinkwise/shared';
import type { Db } from './client';
import { auditLog, users } from './schema';
import type { PublicUser } from './auth';

export const PHONE_DIGITS = 10;
export const ADDRESS_MAX = 300;

/** Fits an older saved number (e.g. "+91 98765 43210") into the 10-digit field. */
export function phoneForForm(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length > PHONE_DIGITS ? digits.slice(-PHONE_DIGITS) : digits;
}

const GenderInput = z.enum(GENDER_VALUES, { error: 'Please choose your gender or select "Prefer not to say".' });

export const ProfileInput = z.object({
  name: z.string().trim().min(1, 'Please enter your full name.').max(80, 'Use at most 80 characters.'),
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Enter a 10-digit phone number, digits only.'),
  address: z
    .string()
    .trim()
    .min(10, 'Please enter your full address.')
    .max(ADDRESS_MAX, `Use at most ${ADDRESS_MAX} characters.`),
  gender: GenderInput,
});
export type ProfileInput = z.input<typeof ProfileInput>;

/** All profile fields need a value; "prefer not to say" is a valid gender choice. */
export function profileComplete(user: Pick<PublicUser, 'name' | 'phone' | 'address' | 'gender'> | null | undefined) {
  return !!user && !!user.name?.trim() && !!user.phone?.trim() && !!user.address?.trim() && GenderInput.safeParse(user.gender).success;
}

export type ProfileResult =
  | { ok: true }
  | { ok: false; fieldErrors: Partial<Record<keyof ProfileInput, string>> };

export async function updateProfile(db: Db, user: PublicUser, input: unknown): Promise<ProfileResult> {
  const parsed = ProfileInput.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof ProfileInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof ProfileInput;
      fieldErrors[field] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const first = !profileComplete(user);
  await db.update(users).set(parsed.data).where(eq(users.id, user.id));
  await db.insert(auditLog).values({
    orgId: user.orgId,
    userId: user.id,
    action: first ? 'profile.complete' : 'profile.update',
    meta: null,
  });
  return { ok: true };
}
