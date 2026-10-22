import type { DB } from '../db.js';
export class TrustRepository {
  constructor(private readonly db: DB) {}

  isTrusted(ownerId: string, trustedId: string): boolean {
    return Boolean(
      this.db
        .prepare('SELECT 1 FROM trusted_users WHERE owner_id = ? AND trusted_id = ?')
        .get(ownerId, trustedId),
    );
  }
  trustedBy(ownerId: string): string[] {
    return (
      this.db
        .prepare('SELECT trusted_id FROM trusted_users WHERE owner_id = ? ORDER BY created_at')
        .all(ownerId) as { trusted_id: string }[]
    ).map((r) => r.trusted_id);
  }
  add(ownerId: string, trustedId: string): boolean {
    return (
      this.db
        .prepare(
          'INSERT OR IGNORE INTO trusted_users (owner_id, trusted_id, created_at) VALUES (?, ?, ?)',
        )
        .run(ownerId, trustedId, new Date().toISOString()).changes > 0
    );
  }
  remove(ownerId: string, trustedId: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM trusted_users WHERE owner_id = ? AND trusted_id = ?')
        .run(ownerId, trustedId).changes > 0
    );
  }
}
