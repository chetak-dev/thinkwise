import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './client';
import { auditLog, users } from './schema';
import type { PublicUser } from './auth';

export const PHONE_MAX = 20;
export const ADDRESS_MAX = 300;

export const ProfileInput = z.object({
  name: z.string().trim().min(1, 'Please enter your full name.').max(80, 'Use at most 80 characters.'),
  phone: z
    .string()
    .trim()
    .max(PHONE_MAX, 'Use at most 20 characters.')
    .regex(/^\+?[\d\s()-]+$/, 'Use digits, spaces, brackets, dashes and an optional leading +.')
    .refine((p) => {
      const digits = p.replace(/\D/g, '').length;
      return digits >= 7 && digits <= 15;
    }, 'Enter a phone number with 7 to 15 digits.'),
  address: z
    .string()
    .trim()
    .min(10, 'Please enter your full address.')
    .max(ADDRESS_MAX, `Use at most ${ADDRESS_MAX} characters.`),
});
export type ProfileInput = z.input<typeof ProfileInput>;

/** Name, phone and address are all required before using the site. */
export function profileComplete(user: Pick<PublicUser, 'name' | 'phone' | 'address'> | null | undefined) {
  return !!user && !!user.name?.trim() && !!user.phone?.trim() && !!user.address?.trim();
}

export type ProfileResult =
  | { ok: true }
  | { ok: false; fieldErrors: Partial<Record<keyof ProfileInput, string>> };

export async function updateProfile(db: Db, user: PublicUser, input: ProfileInput): Promise<ProfileResult> {
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
