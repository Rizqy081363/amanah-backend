import type * as readline from 'node:readline/promises';
import { Pool, type PoolClient } from 'pg';
import type Redis from 'ioredis';
import { invalidateRedisTagsAndPrefixes } from './db-connection';
import {
  printSection,
  padRight,
  askSafeQuestion,
  confirmPurge,
} from './purge-helpers';

export interface UserAffiliationSummary {
  userId: string;
  name: string;
  email: string;
  totalAffiliations: number;
  nonSelfAffiliations: number;
}

export interface UserAffiliationDetail {
  affiliationId: string;
  patientId: string;
  patientName: string;
  relationshipType: string;
  relationLabel: string;
  isPrimary: boolean;
  isSelf: boolean;
  appointmentCount: number;
}

export async function fetchUsersWithAffiliations(
  pool: Pool,
  search?: string,
): Promise<UserAffiliationSummary[]> {
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClause = `AND (LOWER(u.name) LIKE $1 OR LOWER(u.email::text) LIKE $1 OR u.id::text LIKE $1)`;
  }

  const query = `
    SELECT u.id AS user_id, u.name, COALESCE(u.email::text, '-') AS email,
           COUNT(pa.id) AS total_affiliations,
           COUNT(CASE WHEN pa.is_primary = false AND pa.relationship_type::text != 'self' THEN 1 END) AS non_self_affiliations
    FROM users u
    JOIN patient_affiliations pa ON pa.user_id = u.id
    WHERE 1=1 ${whereClause}
    GROUP BY u.id, u.name, u.email
    ORDER BY non_self_affiliations DESC, total_affiliations DESC, u.name ASC;
  `;

  const res = await pool.query(query, params);
  return res.rows.map((r) => ({
    userId: String(r.user_id),
    name: String(r.name),
    email: String(r.email),
    totalAffiliations: Number(r.total_affiliations),
    nonSelfAffiliations: Number(r.non_self_affiliations),
  }));
}

export async function fetchUserAffiliationsDetail(
  pool: Pool,
  userId: string,
): Promise<UserAffiliationDetail[]> {
  const query = `
    SELECT pa.id AS affiliation_id, pa.patient_id, p.full_name AS patient_name,
           pa.relationship_type::text AS relationship_type,
           COALESCE(pa.relation_label, pa.relationship_type::text) AS relation_label,
           pa.is_primary, (pa.relationship_type::text = 'self' OR p.user_id = pa.user_id) AS is_self,
           (SELECT count(*) FROM appointments a WHERE a.patient_id = p.id) AS appointment_count
    FROM patient_affiliations pa
    JOIN patient_profiles p ON pa.patient_id = p.id
    WHERE pa.user_id = $1
    ORDER BY pa.is_primary DESC, (pa.relationship_type::text = 'self') DESC, p.full_name ASC;
  `;

  const res = await pool.query(query, [userId]);
  return res.rows.map((r) => ({
    affiliationId: String(r.affiliation_id),
    patientId: String(r.patient_id),
    patientName: String(r.patient_name),
    relationshipType: String(r.relationship_type),
    relationLabel: String(r.relation_label),
    isPrimary: Boolean(r.is_primary),
    isSelf: Boolean(r.is_self),
    appointmentCount: Number(r.appointment_count),
  }));
}

async function cleanupOrphanedPatients(client: PoolClient, patIds: string[]): Promise<void> {
  if (patIds.length === 0) return;
  await client.query(
    'DELETE FROM maternal_health_intakes WHERE patient_id = ANY($1::uuid[]) AND patient_id NOT IN (SELECT patient_id FROM patient_affiliations)',
    [patIds],
  );
  await client.query(
    'DELETE FROM child_immunization_intakes WHERE patient_id = ANY($1::uuid[]) AND patient_id NOT IN (SELECT patient_id FROM patient_affiliations)',
    [patIds],
  );
  await client.query(
    'DELETE FROM patient_addresses WHERE patient_id = ANY($1::uuid[]) AND patient_id NOT IN (SELECT patient_id FROM patient_affiliations)',
    [patIds],
  );
  await client.query(
    'DELETE FROM patient_profiles WHERE id = ANY($1::uuid[]) AND user_id IS NULL AND id NOT IN (SELECT patient_id FROM patient_affiliations) AND id NOT IN (SELECT patient_id FROM appointments)',
    [patIds],
  );
}

export async function executeAffiliationPurge(
  pool: Pool,
  redisClient: Redis | null,
  options: {
    mode: 'ALL_NON_SELF' | 'USER_ALL_NON_SELF' | 'SINGLE';
    userId?: string;
    affiliationId?: string;
    patientId?: string;
  },
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    let totalDeleted = 0;

    if (options.mode === 'ALL_NON_SELF') {
      const targetAffs = await client.query(
        "SELECT id, patient_id FROM patient_affiliations WHERE is_primary = false AND relationship_type::text != 'self'",
      );
      const affIds = targetAffs.rows.map((r) => r.id);
      const patIds = targetAffs.rows.map((r) => r.patient_id);

      if (affIds.length > 0) {
        const delRes = await client.query('DELETE FROM patient_affiliations WHERE id = ANY($1::uuid[])', [affIds]);
        totalDeleted = delRes.rowCount ?? 0;
        await cleanupOrphanedPatients(client, patIds);
      }
    } else if (options.mode === 'USER_ALL_NON_SELF' && options.userId) {
      const targetAffs = await client.query(
        "SELECT id, patient_id FROM patient_affiliations WHERE user_id = $1 AND is_primary = false AND relationship_type::text != 'self'",
        [options.userId],
      );
      const affIds = targetAffs.rows.map((r) => r.id);
      const patIds = targetAffs.rows.map((r) => r.patient_id);

      if (affIds.length > 0) {
        const delRes = await client.query('DELETE FROM patient_affiliations WHERE id = ANY($1::uuid[])', [affIds]);
        totalDeleted = delRes.rowCount ?? 0;
        await cleanupOrphanedPatients(client, patIds);
      }
    } else if (options.mode === 'SINGLE' && options.affiliationId) {
      const targetAff = await client.query('SELECT id, patient_id FROM patient_affiliations WHERE id = $1', [options.affiliationId]);
      if (targetAff.rows.length > 0) {
        const patId = targetAff.rows[0].patient_id;
        const delRes = await client.query('DELETE FROM patient_affiliations WHERE id = $1', [options.affiliationId]);
        totalDeleted = delRes.rowCount ?? 0;
        await cleanupOrphanedPatients(client, [patId]);
      }
    }

    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(
      redisClient,
      ['affiliations', 'affiliations:me', 'patients', 'booking', 'appointments:me'],
      ['*affiliation*', '*patient*'],
    );
    return { success: true, deletedCount: totalDeleted };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, deletedCount: 0, error: msg };
  } finally {
    client.release();
  }
}

function renderUsersTable(list: UserAffiliationSummary[]): void {
  if (list.length === 0) {
    console.log('No users found with patient affiliations.');
    return;
  }
  const idxW = 4;
  const nameW = 22;
  const emailW = 28;
  const nonSelfW = 10;
  const totalW = 8;
  const idW = 36;

  console.log(
    padRight('#', idxW) + ' ' + padRight('User Name', nameW) + ' ' +
    padRight('Email', emailW) + ' ' + padRight('Affiliations', nonSelfW) + ' ' +
    padRight('Total', totalW) + ' ' + padRight('User ID', idW)
  );
  console.log('-'.repeat(idxW + nameW + emailW + nonSelfW + totalW + idW + 5));

  list.forEach((u, i) => {
    console.log(
      padRight(String(i + 1), idxW) + ' ' + padRight(u.name, nameW) + ' ' +
      padRight(u.email, emailW) + ' ' + padRight(String(u.nonSelfAffiliations), nonSelfW) + ' ' +
      padRight(String(u.totalAffiliations), totalW) + ' ' + padRight(u.userId, idW)
    );
  });
  console.log(`\nShowing ${list.length} user(s) with affiliations.`);
}

function renderAffiliationsTable(list: UserAffiliationDetail[]): void {
  const idxW = 4;
  const relW = 16;
  const nameW = 24;
  const selfW = 10;
  const apptW = 8;
  const affIdW = 36;

  console.log(
    padRight('#', idxW) + ' ' + padRight('Relationship', relW) + ' ' +
    padRight('Patient Name', nameW) + ' ' + padRight('Account', selfW) + ' ' +
    padRight('Appts', apptW) + ' ' + padRight('Affiliation ID', affIdW)
  );
  console.log('-'.repeat(idxW + relW + nameW + selfW + apptW + affIdW + 5));

  list.forEach((a, i) => {
    console.log(
      padRight(String(i + 1), idxW) + ' ' + padRight(a.relationLabel || a.relationshipType, relW) + ' ' +
      padRight(a.patientName, nameW) + ' ' + padRight(a.isSelf ? 'Self' : 'Family', selfW) + ' ' +
      padRight(String(a.appointmentCount), apptW) + ' ' + padRight(a.affiliationId, affIdW)
    );
  });
}

export async function runAffiliationPurgeInteractive(
  pool: Pool,
  redisClient: Redis | null,
  rl: readline.Interface,
): Promise<void> {
  while (true) {
    const totalAffRes = await pool.query(
      "SELECT count(*) FROM patient_affiliations WHERE is_primary = false AND relationship_type::text != 'self'",
    );
    const nonSelfCount = parseInt(totalAffRes.rows[0]?.count ?? '0', 10);

    printSection(`Patient Affiliation Purge Menu [Non-Self Affiliations in DB: ${nonSelfCount}]`);
    console.log('Options:');
    console.log(' [1] Flush ALL Non-Self Affiliations (100% System-Wide Purge)');
    console.log(' [2] List Users with Affiliations & Purge by User');
    console.log(' [3] Search User by Keyword (Name / Email / UUID)');
    console.log(' [b] Back to Main Menu\n');

    const choice = await askSafeQuestion(rl, 'Enter selection [1-3 or b]: ');
    if (!choice || choice.toLowerCase() === 'b' || choice.toLowerCase() === 'back') break;

    if (choice === '1') {
      if (nonSelfCount === 0) {
        console.log('\n[INFO] Zero non-self affiliations in database. Nothing to purge.');
        continue;
      }
      const confirmed = await confirmPurge(
        rl,
        'ALL NON-SELF PATIENT AFFILIATIONS (SYSTEM-WIDE)',
        nonSelfCount,
        'All family/relative affiliation records and unused secondary patient profiles will be deleted. Primary user accounts remain intact.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge canceled.');
        continue;
      }

      console.log('\n[INFO] Executing system-wide non-self affiliations purge...');
      const res = await executeAffiliationPurge(pool, redisClient, { mode: 'ALL_NON_SELF' });
      if (res.success) {
        console.log(`\n[SUCCESS] Purged ${res.deletedCount} affiliation records.`);
      } else {
        console.log(`\n[ERROR] Failed to purge affiliations: ${res.error}`);
      }
      continue;
    }

    let users: UserAffiliationSummary[] = [];
    if (choice === '2') {
      users = await fetchUsersWithAffiliations(pool);
      renderUsersTable(users);
    } else if (choice === '3') {
      const keyword = await askSafeQuestion(rl, 'Enter user search keyword: ');
      if (!keyword) continue;
      users = await fetchUsersWithAffiliations(pool, keyword);
      renderUsersTable(users);
    } else {
      console.log('[WARN] Invalid option.');
      continue;
    }

    if (users.length === 0) continue;

    console.log('\nTo inspect & purge affiliations for a user:');
    console.log('- Enter row number from list (e.g. 1)');
    console.log('- Or paste User UUID / Email');
    console.log('- Or press Enter / "c" to cancel.');

    const targetInput = await askSafeQuestion(rl, '\nSelect User: ');
    if (!targetInput || targetInput.toLowerCase() === 'c') {
      console.log('[INFO] Selection canceled.');
      continue;
    }

    let targetUserId = targetInput;
    let targetUserName = '';
    const num = parseInt(targetInput, 10);
    if (!isNaN(num) && num >= 1 && num <= users.length) {
      targetUserId = users[num - 1].userId;
      targetUserName = users[num - 1].name;
    } else {
      const found = users.find(
        (u) => u.userId.toLowerCase() === targetInput.toLowerCase() || u.email.toLowerCase() === targetInput.toLowerCase(),
      );
      if (found) {
        targetUserId = found.userId;
        targetUserName = found.name;
      }
    }

    const affDetails = await fetchUserAffiliationsDetail(pool, targetUserId);
    if (affDetails.length === 0) {
      console.log(`[INFO] No affiliations found for user ${targetUserId}.`);
      continue;
    }

    printSection(`Affiliations for User: ${targetUserName || targetUserId}`);
    renderAffiliationsTable(affDetails);

    const nonSelfList = affDetails.filter((a) => !a.isSelf);
    console.log('\nActions:');
    console.log(` [1] Purge ALL non-self affiliations for this user (${nonSelfList.length} records)`);
    console.log(' [2] Purge a specific affiliation record (by row #)');
    console.log(' [c] Cancel / Back\n');

    const subChoice = await askSafeQuestion(rl, 'Enter action [1-2 or c]: ');
    if (subChoice === '1') {
      if (nonSelfList.length === 0) {
        console.log('[INFO] User has no non-self affiliations to purge.');
        continue;
      }
      const confirmed = await confirmPurge(
        rl,
        `All non-self affiliations for ${targetUserName || targetUserId}`,
        nonSelfList.length,
        'Secondary patient profiles and intake records will be cleaned up. The user account itself remains intact.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge canceled.');
        continue;
      }

      console.log('\n[INFO] Executing user affiliations purge...');
      const res = await executeAffiliationPurge(pool, redisClient, {
        mode: 'USER_ALL_NON_SELF',
        userId: targetUserId,
      });

      if (res.success) {
        console.log(`\n[SUCCESS] Purged ${res.deletedCount} affiliation(s) for user ${targetUserName}.`);
      } else {
        console.log(`\n[ERROR] Failed to purge user affiliations: ${res.error}`);
      }
    } else if (subChoice === '2') {
      const affRowInput = await askSafeQuestion(rl, 'Enter affiliation row # to delete: ');
      if (!affRowInput) continue;
      const affRowNum = parseInt(affRowInput, 10);
      if (isNaN(affRowNum) || affRowNum < 1 || affRowNum > affDetails.length) {
        console.log('[WARN] Invalid row number.');
        continue;
      }

      const targetAff = affDetails[affRowNum - 1];
      if (targetAff.isSelf) {
        console.log('[WARN] Cannot delete primary self affiliation. To delete the user, use User Purge menu.');
        continue;
      }

      const confirmed = await confirmPurge(
        rl,
        `Affiliation for ${targetAff.patientName} (${targetAff.relationLabel})`,
        1,
      );
      if (!confirmed) {
        console.log('[INFO] Purge canceled.');
        continue;
      }

      const res = await executeAffiliationPurge(pool, redisClient, {
        mode: 'SINGLE',
        affiliationId: targetAff.affiliationId,
        patientId: targetAff.patientId,
      });

      if (res.success) {
        console.log(`\n[SUCCESS] Purged affiliation for ${targetAff.patientName}.`);
      } else {
        console.log(`\n[ERROR] Failed to purge affiliation: ${res.error}`);
      }
    }
  }
}
