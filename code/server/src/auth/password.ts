import { hash, verify } from '@node-rs/argon2';

// OWASP recommended Argon2id parameters (19 MiB, 2 iterations, 1 lane).
// @node-rs/argon2 uses Argon2id by default.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Spends the same time as a real verification so unknown usernames can't be detected by timing. */
export async function dummyVerify(password: string): Promise<false> {
  dummyHash ??= hashPassword('travelsteps-timing-dummy');
  await verifyPassword(await dummyHash, password);
  return false;
}
