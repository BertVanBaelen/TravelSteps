import { z } from 'zod';

/** Every state-changing API request must carry this header (CSRF protection). */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'TravelSteps';

export const PASSWORD_MIN_LENGTH = 10;

/** Admins are travellers too and see everything; travellers write posts; viewers only read. */
export const ROLES = ['admin', 'traveller', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** Admin or traveller: may create travels and write posts. */
export const isTraveller = (role: Role): boolean => role === 'admin' || role === 'traveller';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  mustChangeCredentials: boolean;
  mustChangePassword: boolean;
  disabled: boolean;
  createdAt: string;
  /** Versioned URL of the profile picture, or null. */
  avatarUrl: string | null;
  /** A personal Immich API key is stored (the key itself never leaves the server). */
  hasImmichKey: boolean;
}

/** A travel owned by a user, shown when the admin deletes that user. */
export interface OwnedTravel {
  id: string;
  name: string;
  /** Accepted members that could take over the travel. */
  members: { id: string; displayName: string }[];
}

/** User as shown in the admin user list. */
export interface AdminUser extends PublicUser {
  ownedTravels: OwnedTravel[];
}

/** Minimal user info for picking travel members and viewers. */
export interface DirectoryUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

export const usernameSchema = z
  .string()
  .trim()
  .regex(
    /^[a-zA-Z0-9._-]{3,32}$/,
    'Gebruikersnaam moet 3 tot 32 tekens zijn (letters, cijfers, punt, streepje of underscore)',
  );

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Wachtwoord moet minstens ${PASSWORD_MIN_LENGTH} tekens bevatten`)
  .max(256, 'Wachtwoord is te lang');

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Weergavenaam is verplicht')
  .max(60, 'Weergavenaam mag maximaal 60 tekens zijn');

/** Not required during a forced change right after login (the user just entered it). */
const currentPasswordSchema = z.string().max(256).optional();

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Gebruikersnaam is verplicht').max(64),
  password: z.string().min(1, 'Wachtwoord is verplicht').max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changeCredentialsSchema = z.object({
  currentPassword: currentPasswordSchema,
  newUsername: usernameSchema,
  newPassword: passwordSchema,
  displayName: displayNameSchema.optional(),
});
export type ChangeCredentialsInput = z.infer<typeof changeCredentialsSchema>;

export const changePasswordSchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Roles the admin can give to other users (there is exactly one admin). */
export const assignableRoleSchema = z.enum(['traveller', 'viewer']);

export const createUserSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  temporaryPassword: passwordSchema,
  role: assignableRoleSchema.default('viewer'),
});
export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    disabled: z.boolean().optional(),
    role: assignableRoleSchema.optional(),
  })
  .refine((v) => v.displayName !== undefined || v.disabled !== undefined || v.role !== undefined, {
    message: 'Niets om te wijzigen',
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Set (string) or remove (null) a personal Immich API key. */
export const immichKeySchema = z.object({
  apiKey: z.string().trim().min(10, 'Ongeldige API-sleutel').max(200, 'Ongeldige API-sleutel').nullable(),
});
export type ImmichKeyInput = z.infer<typeof immichKeySchema>;

/**
 * Deleting a user who owns travels: delete those travels (with all posts), transfer each travel
 * to a new owner, or only disable the user.
 */
export const deleteUserSchema = z.object({
  mode: z.enum(['delete', 'transfer', 'disable']).default('delete'),
  /** travelId → new owner (mode 'transfer'); owned travels not listed here are deleted. */
  transfers: z.record(z.string().uuid(), z.string().uuid()).default({}),
});
export type DeleteUserInput = z.input<typeof deleteUserSchema>;

export const resetPasswordSchema = z.object({
  temporaryPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
  displayName: displayNameSchema,
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Max. size of an uploaded (already resized) profile picture. */
export const AVATAR_MAX_BYTES = 400 * 1024;

/** Either an uploaded image (base64, resized in the browser) or – travellers only – a photo from their own Immich. */
export const avatarInputSchema = z.union([
  z.object({
    image: z
      .string()
      .max(Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 4, 'Afbeelding is te groot')
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Ongeldige afbeelding'),
  }),
  z.object({ assetId: z.string().uuid('Ongeldig foto-ID') }),
]);
export type AvatarInput = z.infer<typeof avatarInputSchema>;
