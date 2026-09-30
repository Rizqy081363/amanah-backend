import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type * as readline from 'node:readline/promises';
import { Pool, type PoolClient } from 'pg';
import type Redis from 'ioredis';
import { resolvedStorageRoot } from './db-connection';
import { printSection, padRight, askSafeQuestion } from './purge-helpers';
import {
  type UserInspectionResult,
  inspectUserRecords,
  renderInspectionResult,
} from './user-inspection';

export {
  type TableCount,
  type UserInspectionResult,
  inspectUserRecords,
  renderInspectionResult,
} from './user-inspection';

export interface DiscoveredUser {
  coreId: string | null;
  authId: string | null;
  email: string;
  name: string;
  roles: string;
  isMobile: boolean;
  deviceCount: number;
  sessionCount: number;
  createdAt: string;
}

export async function fetchAllUsers(
  pool: Pool,
  options?: { mobileOnly?: boolean; search?: string },
): Promise<DiscoveredUser[]> {
  const query = `
    WITH mobile_sessions AS (
      SELECT "userId", count(*) as mobile_session_count
      FROM "session"
      WHERE "userAgent" ILIKE '%mobile%' 
         OR "userAgent" ILIKE '%android%' 
         OR "userAgent" ILIKE '%iphone%' 
         OR "userAgent" ILIKE '%ipad%' 
         OR "userAgent" ILIKE '%flutter%' 
         OR "userAgent" ILIKE '%dart%'
      GROUP BY "userId"
    ),
    device_counts AS (
      SELECT user_id, count(*) as dev_count
      FROM user_devices
      GROUP BY user_id
    ),
    all_roles AS (
      SELECT ur.user_id, string_agg(r.code, ', ') as roles_str
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      GROUP BY ur.user_id
    )
    SELECT 
      COALESCE(u.id, bu.id) AS id,
      u.id AS core_id,
      bu.id AS auth_id,
      COALESCE(u.email, bu.email) AS email,
      COALESCE(u.name, bu.name) AS name,
      COALESCE(ar.roles_str, bu.role, 'none') AS roles,
      COALESCE(dc.dev_count, 0) AS device_count,
      COALESCE(ms.mobile_session_count, 0) AS mobile_session_count,
      (COALESCE(dc.dev_count, 0) > 0 OR COALESCE(ms.mobile_session_count, 0) > 0) AS is_mobile,
      COALESCE(u.created_at, bu."createdAt") AS created_at
    FROM users u
    FULL OUTER JOIN "user" bu ON LOWER(u.email::text) = LOWER(bu.email)
    LEFT JOIN device_counts dc ON u.id = dc.user_id
    LEFT JOIN mobile_sessions ms ON bu.id = ms."userId"
    LEFT JOIN all_roles ar ON u.id = ar.user_id
    ORDER BY COALESCE(u.created_at, bu."createdAt") DESC;
  `;

  const res = await pool.query(query);
  let users: DiscoveredUser[] = res.rows.map((row) => ({
    coreId: row.core_id ? String(row.core_id) : null,
    authId: row.auth_id ? String(row.auth_id) : null,
    email: String(row.email),
    name: String(row.name),
    roles: String(row.roles),
    isMobile: Boolean(row.is_mobile),
    deviceCount: Number(row.device_count || 0),
    sessionCount: Number(row.mobile_session_count || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '-',
  }));

  if (options?.mobileOnly) {
    users = users.filter((u) => u.isMobile);
  }

  if (options?.search) {
    const s = options.search.toLowerCase();
    users = users.filter(
      (u) =>
        u.email.toLowerCase().includes(s) ||
        u.name.toLowerCase().includes(s) ||
        u.roles.toLowerCase().includes(s) ||
        (u.coreId && u.coreId.toLowerCase().includes(s)) ||
        (u.authId && u.authId.toLowerCase().includes(s)),
    );
  }

  return users;
}

export async function executeUserPurge(
  pool: Pool,
  inspection: UserInspectionResult,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedRows: number; error?: string }> {
  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

    const targetInput = inspection.coreUserId || inspection.authUserId || inspection.email;
    const purgeQuery = `SELECT purge_user_systemic($1) AS res;`;
    const purgeRes = await client.query(purgeQuery, [targetInput]);
    const resData = purgeRes.rows[0]?.res;

    if (!resData || resData.status !== 'success') {
      throw new Error(resData?.message || 'purge_user_systemic did not return success.');
    }

    await client.query('COMMIT');

    const targetDirs = [
      inspection.coreUserId ? resolve(resolvedStorageRoot, 'avatars', inspection.coreUserId) : null,
      inspection.authUserId ? resolve(resolvedStorageRoot, 'avatars', inspection.authUserId) : null,
    ].filter(Boolean) as string[];

    for (const dir of targetDirs) {
      if (existsSync(dir)) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch (err: unknown) {
          console.warn(`[WARN] Failed to delete disk avatar dir ${dir}:`, err instanceof Error ? err.message : String(err));
        }
      }
    }

    if (redisClient) {
      try {
        const patterns = [
          inspection.coreUserId ? `*${inspection.coreUserId}*` : null,
          inspection.authUserId ? `*${inspection.authUserId}*` : null,
          `*${inspection.email}*`,
        ].filter(Boolean) as string[];

        for (const pat of patterns) {
          const keys = await redisClient.keys(pat);
          if (keys.length > 0) {
            await redisClient.del(...keys);
          }
        }
      } catch (err: unknown) {
        console.warn('[WARN] Redis cache cleanup failed:', err instanceof Error ? err.message : String(err));
      }
    }

    return { success: true, deletedRows: inspection.totalDbRows };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, deletedRows: 0, error: msg };
  } finally {
    client.release();
  }
}

export function renderUsersTable(users: DiscoveredUser[]): void {
  if (users.length === 0) {
    console.log('No users found matching current filter.');
    return;
  }

  const idxW = 4;
  const nameW = 22;
  const emailW = 30;
  const roleW = 14;
  const mobW = 8;
  const idW = 36;

  console.log(
    padRight('#', idxW) + ' ' +
    padRight('Name', nameW) + ' ' +
    padRight('Email', emailW) + ' ' +
    padRight('Role(s)', roleW) + ' ' +
    padRight('Mobile?', mobW) + ' ' +
    padRight('User ID (UUID)', idW)
  );
  console.log('-'.repeat(idxW + nameW + emailW + roleW + mobW + idW + 5));

  users.forEach((u, i) => {
    const mobStr = u.isMobile ? 'YES' : 'NO';
    const idStr = u.coreId || u.authId || '-';
    console.log(
      padRight(String(i + 1), idxW) + ' ' +
      padRight(u.name, nameW) + ' ' +
      padRight(u.email, emailW) + ' ' +
      padRight(u.roles, roleW) + ' ' +
      padRight(mobStr, mobW) + ' ' +
      padRight(idStr, idW)
    );
  });
  console.log(`\nShowing ${users.length} user(s).`);
}

export async function runUserPurgeInteractive(
  pool: Pool,
  redisClient: Redis | null,
  rl: readline.Interface,
): Promise<void> {
  while (true) {
    const allUsers = await fetchAllUsers(pool);
    const mobileCount = allUsers.filter((u) => u.isMobile).length;

    printSection(`User Discovery [Total: ${allUsers.length} | Mobile: ${mobileCount}]`);
    console.log('Options:');
    console.log(' [1] List All Users');
    console.log(' [2] List Mobile Users Only');
    console.log(' [3] Search by Keyword (Name / Email / Role / ID)');
    console.log(' [4] Direct Input: Enter/Paste Email or UUID to Purge');
    console.log(' [b] Back to Main Menu\n');

    const choice = await askSafeQuestion(rl, 'Enter selection [1-4 or b]: ');
    if (!choice || choice.toLowerCase() === 'b' || choice.toLowerCase() === 'back') {
      break;
    }

    let targetUsers: DiscoveredUser[] = [];

    if (choice === '1') {
      targetUsers = await fetchAllUsers(pool);
      printSection(`Listing All Users (${targetUsers.length})`);
      renderUsersTable(targetUsers);
    } else if (choice === '2') {
      targetUsers = await fetchAllUsers(pool, { mobileOnly: true });
      printSection(`Listing Mobile Users Only (${targetUsers.length})`);
      renderUsersTable(targetUsers);
    } else if (choice === '3') {
      const query = await askSafeQuestion(rl, 'Enter search keyword: ');
      if (!query) continue;
      targetUsers = await fetchAllUsers(pool, { search: query });
      printSection(`Search Results for "${query}" (${targetUsers.length})`);
      renderUsersTable(targetUsers);
    } else if (choice === '4') {
      // Direct input mode
    } else {
      console.log('[WARN] Invalid option. Please choose 1, 2, 3, 4, or b.');
      continue;
    }

    console.log('\nTo purge a user, you can:');
    console.log('- Enter the table row number (e.g. 1)');
    console.log('- Paste the exact Email (e.g. user@gmail.com)');
    console.log('- Paste the exact User UUID (e.g. 5981c212-ebb0-4286-9514-db0519879b79)');
    console.log('- Or press Enter / "c" to cancel.');

    const targetInput = await askSafeQuestion(rl, '\nSelect User to Purge: ');
    if (!targetInput || targetInput.toLowerCase() === 'c') {
      console.log('[INFO] Canceled selection.');
      continue;
    }

    let selectedIdentifier = targetInput;
    const numIdx = parseInt(targetInput, 10);
    if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= targetUsers.length) {
      const picked = targetUsers[numIdx - 1];
      selectedIdentifier = picked.email;
    }

    console.log(`\n[INFO] Inspecting target: ${selectedIdentifier} ...`);
    const inspection = await inspectUserRecords(pool, selectedIdentifier, redisClient);

    if (!inspection) {
      console.log(`[ERROR] No user found with Email or UUID: ${selectedIdentifier}`);
      continue;
    }

    renderInspectionResult(inspection);

    if (inspection.totalDbRows === 0 && !inspection.avatarDirExists && inspection.redisKeyCount === 0) {
      console.log('\n[INFO] User has zero associated records or has already been purged.');
      continue;
    }

    console.log('\n================================================================================');
    console.log(' [ACTION REQUIRED] CONFIRM PERMANENT PURGE');
    console.log('--------------------------------------------------------------------------------');
    console.log(` Target User : ${inspection.name} <${inspection.email}>`);
    console.log(` Total Rows  : ${inspection.totalDbRows} rows will be deleted from PostgreSQL.`);
    console.log(` Storage     : ${inspection.avatarDirExists ? 'Avatar directory will be deleted.' : 'No storage files.'}`);
    console.log(` Redis Cache : ${inspection.redisKeyCount > 0 ? `${inspection.redisKeyCount} cache keys will be evicted.` : 'No cache keys.'}`);
    console.log('================================================================================');

    console.log('Type "PURGE" or "y" to execute cascade purge, or "n" to abort.');
    const confirm = await askSafeQuestion(rl, 'Confirm [y/N]: ');
    if (confirm?.toUpperCase() !== 'PURGE' && confirm?.toLowerCase() !== 'y') {
      console.log('[INFO] Purge aborted by user. No records were modified.');
      continue;
    }

    console.log('\n[INFO] Executing transactional cascade purge...');
    const purgeResult = await executeUserPurge(pool, inspection, redisClient);

    if (purgeResult.success) {
      console.log('\n[SUCCESS] PURGE COMPLETE');
      console.log(` - User Email     : ${inspection.email}`);
      console.log(` - Database Rows  : ${purgeResult.deletedRows} rows deleted successfully.`);
      if (inspection.avatarDirExists) {
        console.log(` - Storage Files  : Local avatar files removed.`);
      }
      if (inspection.redisKeyCount > 0) {
        console.log(` - Redis Sessions : Cache entries evicted.`);
      }
    } else {
      console.log(`\n[ERROR] PURGE FAILED: ${purgeResult.error}`);
    }

    const continueAnswer = await askSafeQuestion(rl, '\nPurge another user? [y/N]: ');
    if (continueAnswer?.toLowerCase() !== 'y') {
      break;
    }
  }
}
