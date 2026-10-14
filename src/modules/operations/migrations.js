import { now } from '../../utils/core.js';
export const SCHEMA_VERSION = 1;
// Additive, idempotent startup migrations. Never rewrite approved snapshots.
export async function migrate(store) {
  const existing = await store.get('schema_migrations', 'operations-v1');
  if (existing) return;
  try {
    await store.insert('schema_migrations', {
      id: 'operations-v1',
      version: SCHEMA_VERSION,
      description:
        'Operational records, metered AI admission, cursor indexes and recovery metadata',
      completedAt: now(),
    });
  } catch (error) {
    if (!['DUPLICATE', 11000].includes(error.code)) throw error;
  }
}
