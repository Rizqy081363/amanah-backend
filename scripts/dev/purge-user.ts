#!/usr/bin/env bun
/**
 * Amanah Healthcare - Selective User Purge Runner Script
 * 
 * Purpose:
 *   Developer CLI to discover, inspect, and cleanly purge (hard delete) 
 *   selective users and all their associated relational data across 
 *   PostgreSQL tables, Better Auth, file assets, and Redis cache.
 * 
 * Design:
 *   - Plain-text ASCII terminal UI (No emojis)
 *   - Selective discovery: All users, Mobile users, Search keyword, or Direct ID/Email
 *   - Deep relational inspection across 50+ tables before deletion
 *   - Transactional cascade execution
 *   - Disk avatar & Redis session cache cleanup
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Pool, type PoolClient } from 'pg';
import Redis from 'ioredis';

// --- Environment & Configuration Loading ---

const repoRoot = resolve(import.meta.dir, '../..');

function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(filePath)) return result;

  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let val = match[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

const exampleEnv = parseEnvFile(resolve(repoRoot, '.env.example'));
const localEnv = parseEnvFile(resolve(repoRoot, '.env'));

function getEnvValue(name: string, fallback: string): string {
  const fromProcess = process.env[name];
  if (fromProcess && fromProcess.trim()) return fromProcess.trim();
  const fromLocal = localEnv[name];
  if (fromLocal && fromLocal.trim()) return fromLocal.trim();
  const fromExample = exampleEnv[name];
  if (fromExample && fromExample.trim()) return fromExample.trim();
  return fallback;
}

const dbHost = getEnvValue('DATABASE_HOST', 'localhost');
const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';
const dbPort = parseInt(
  isLocal
    ? getEnvValue('POSTGRES_HOST_PORT', getEnvValue('DATABASE_PORT', '5433'))
    : getEnvValue('DATABASE_PORT', '5432'),
  10,
);
const dbUser = getEnvValue('DATABASE_USERNAME', 'amanah');
const dbPassword = getEnvValue('DATABASE_PASSWORD', 'amanah_secret');
const dbName = getEnvValue('DATABASE_NAME', 'amanah_healthcare');

const redisHost = getEnvValue('REDIS_HOST', 'localhost');
const redisPort = parseInt(
  getEnvValue('REDIS_HOST_PORT', getEnvValue('REDIS_PORT', '6379')),
  10,
);

const storageRoot = getEnvValue('STORAGE_ROOT', 'data/uploads');
const resolvedStorageRoot = resolve(repoRoot, storageRoot);

// --- Types ---

interface DiscoveredUser {
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

interface TableCount {
  tableName: string;
  rowCount: number;
}

interface UserInspectionResult {
  coreUserId: string | null;
  authUserId: string | null;
  email: string;
  name: string;
  roles: string[];
  staffProfileId: string | null;
  practitionerId: string | null;
  patientProfileId: string | null;
  tableCounts: TableCount[];
  totalDbRows: number;
  avatarDirExists: boolean;
  avatarDirPath: string | null;
  redisKeyCount: number;
}

// --- Database & Redis Helpers ---

function createDbPool(): Pool {
  return new Pool({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    max: 3,
    connectionTimeoutMillis: 5000,
  });
}

async function getRedisClient(): Promise<Redis | null> {
  try {
    const client = new Redis({
      host: redisHost,
      port: redisPort,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

// --- User Queries ---

async function fetchAllUsers(pool: Pool, options?: { mobileOnly?: boolean; search?: string }): Promise<DiscoveredUser[]> {
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

// --- Relational Inspection ---

async function inspectUserRecords(
  pool: Pool,
  targetEmailOrId: string,
  redisClient: Redis | null,
): Promise<UserInspectionResult | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    targetEmailOrId.trim(),
  );

  // 1. Resolve user identities from both users and "user"
  const userQuery = isUuid
    ? `
      SELECT 
        u.id AS core_id, 
        bu.id AS auth_id, 
        COALESCE(u.email, bu.email) AS email, 
        COALESCE(u.name, bu.name) AS name 
      FROM users u
      FULL OUTER JOIN "user" bu ON LOWER(u.email::text) = LOWER(bu.email)
      WHERE u.id = $1::uuid OR bu.id = $1::uuid
      LIMIT 1;
    `
    : `
      SELECT 
        u.id AS core_id, 
        bu.id AS auth_id, 
        COALESCE(u.email, bu.email) AS email, 
        COALESCE(u.name, bu.name) AS name 
      FROM users u
      FULL OUTER JOIN "user" bu ON LOWER(u.email::text) = LOWER(bu.email)
      WHERE LOWER(u.email::text) = LOWER($1) OR LOWER(bu.email) = LOWER($1)
      LIMIT 1;
    `;

  const userRes = await pool.query(userQuery, [targetEmailOrId.trim()]);
  if (userRes.rows.length === 0) {
    return null;
  }

  const coreUserId: string | null = userRes.rows[0].core_id ? String(userRes.rows[0].core_id) : null;
  const authUserId: string | null = userRes.rows[0].auth_id ? String(userRes.rows[0].auth_id) : null;
  const email: string = String(userRes.rows[0].email);
  const name: string = String(userRes.rows[0].name);

  // 2. Resolve roles
  const rolesRes = coreUserId
    ? await pool.query(
        `SELECT r.code FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1`,
        [coreUserId],
      )
    : { rows: [] };
  const roles: string[] = rolesRes.rows.map((r) => r.code);

  // 3. Resolve staff profile & practitioner if applicable
  let staffProfileId: string | null = null;
  let practitionerId: string | null = null;

  const staffRes = await pool.query(
    `SELECT id FROM staff_profiles WHERE (user_id IS NOT NULL AND user_id = $1) OR LOWER(email::text) = LOWER($2) LIMIT 1`,
    [coreUserId, email],
  );
  if (staffRes.rows.length > 0) {
    staffProfileId = String(staffRes.rows[0].id);
    const pracRes = await pool.query(
      `SELECT id FROM practitioners WHERE staff_profile_id = $1 LIMIT 1`,
      [staffProfileId],
    );
    if (pracRes.rows.length > 0) {
      practitionerId = String(pracRes.rows[0].id);
    }
  }

  // 4. Resolve patient profile if applicable
  let patientProfileId: string | null = null;
  const patientRes = await pool.query(
    `SELECT id FROM patient_profiles WHERE (user_id IS NOT NULL AND user_id = $1) OR LOWER(email::text) = LOWER($2) LIMIT 1`,
    [coreUserId, email],
  );
  if (patientRes.rows.length > 0) {
    patientProfileId = String(patientRes.rows[0].id);
  }

  // 5. Scan table row counts
  const tableCounts: TableCount[] = [];

  async function checkCount(tableName: string, sql: string, params: unknown[]): Promise<void> {
    try {
      const r = await pool.query(sql, params);
      const cnt = parseInt(r.rows[0]?.count ?? '0', 10);
      if (cnt > 0) {
        tableCounts.push({ tableName, rowCount: cnt });
      }
    } catch {
      // Skip if table does not exist or query fails
    }
  }

  // Core Identity & Better Auth
  if (authUserId) {
    await checkCount('user (Better Auth)', 'SELECT count(*) FROM "user" WHERE id = $1', [authUserId]);
    await checkCount('session', 'SELECT count(*) FROM "session" WHERE "userId" = $1', [authUserId]);
    await checkCount('account', 'SELECT count(*) FROM "account" WHERE "userId" = $1', [authUserId]);
  }
  await checkCount('verification', 'SELECT count(*) FROM "verification" WHERE identifier = $1', [email]);

  if (coreUserId) {
    await checkCount('users', 'SELECT count(*) FROM users WHERE id = $1', [coreUserId]);
    await checkCount('user_roles', 'SELECT count(*) FROM user_roles WHERE user_id = $1', [coreUserId]);
    await checkCount('user_devices', 'SELECT count(*) FROM user_devices WHERE user_id = $1', [coreUserId]);
    await checkCount('user_data_export_jobs', 'SELECT count(*) FROM user_data_export_jobs WHERE requested_by = $1', [coreUserId]);
    await checkCount('auth_accounts', 'SELECT count(*) FROM auth_accounts WHERE user_id = $1', [coreUserId]);
    await checkCount('auth_sessions', 'SELECT count(*) FROM auth_sessions WHERE user_id = $1', [coreUserId]);
    await checkCount('auth_two_factors', 'SELECT count(*) FROM auth_two_factors WHERE user_id = $1', [coreUserId]);
    await checkCount('auth_verifications', 'SELECT count(*) FROM auth_verifications WHERE identifier = $1', [email]);
    await checkCount('audit_logs', 'SELECT count(*) FROM audit_logs WHERE actor_user_id = $1', [coreUserId]);
    await checkCount('files', 'SELECT count(*) FROM files WHERE uploaded_by = $1', [coreUserId]);
    await checkCount('notifications (created)', 'SELECT count(*) FROM notifications WHERE created_by = $1', [coreUserId]);
    await checkCount('notification_recipients', 'SELECT count(*) FROM notification_recipients WHERE user_id = $1', [coreUserId]);
    await checkCount('support_tickets (reported)', 'SELECT count(*) FROM support_tickets WHERE reporter_user_id = $1', [coreUserId]);
    await checkCount('support_ticket_messages', 'SELECT count(*) FROM support_ticket_messages WHERE sender_user_id = $1', [coreUserId]);
    await checkCount('conversation_participants', 'SELECT count(*) FROM conversation_participants WHERE user_id = $1', [coreUserId]);
    await checkCount('messages', 'SELECT count(*) FROM messages WHERE sender_user_id = $1', [coreUserId]);
    await checkCount('attendance_qr_sessions (created)', 'SELECT count(*) FROM attendance_qr_sessions WHERE created_by = $1', [coreUserId]);
    await checkCount('clinical_encounters (created)', 'SELECT count(*) FROM clinical_encounters WHERE created_by = $1', [coreUserId]);
    await checkCount('appointments (created/updated)', 'SELECT count(*) FROM appointments WHERE created_by = $1 OR updated_by = $1', [coreUserId]);
    await checkCount('appointment_status_events', 'SELECT count(*) FROM appointment_status_events WHERE changed_by = $1', [coreUserId]);
  }

  // Staff & Practitioner
  if (staffProfileId) {
    await checkCount('staff_profiles', 'SELECT count(*) FROM staff_profiles WHERE id = $1', [staffProfileId]);
    await checkCount('staff_credentials', 'SELECT count(*) FROM staff_credentials WHERE staff_profile_id = $1', [staffProfileId]);
    await checkCount('staff_attendance_records', 'SELECT count(*) FROM staff_attendance_records WHERE staff_profile_id = $1', [staffProfileId]);
    await checkCount('staff_leave_requests', 'SELECT count(*) FROM staff_leave_requests WHERE staff_profile_id = $1', [staffProfileId]);
    await checkCount('attendance_qr_sessions (staff)', 'SELECT count(*) FROM attendance_qr_sessions WHERE staff_profile_id = $1', [staffProfileId]);
  }

  if (practitionerId) {
    await checkCount('practitioners', 'SELECT count(*) FROM practitioners WHERE id = $1', [practitionerId]);
    await checkCount('practitioner_availability', 'SELECT count(*) FROM practitioner_availability WHERE practitioner_id = $1', [practitionerId]);
    await checkCount('practitioner_schedule_sessions', 'SELECT count(*) FROM practitioner_schedule_sessions WHERE practitioner_id = $1', [practitionerId]);
    await checkCount('practitioner_schedule_day_settings', 'SELECT count(*) FROM practitioner_schedule_day_settings WHERE practitioner_id = $1', [practitionerId]);
    await checkCount('practitioner_leave_periods', 'SELECT count(*) FROM practitioner_leave_periods WHERE practitioner_id = $1', [practitionerId]);
    await checkCount('appointments (as doctor)', 'SELECT count(*) FROM appointments WHERE practitioner_id = $1', [practitionerId]);
    await checkCount('queue_tickets (as doctor)', 'SELECT count(*) FROM queue_tickets qt JOIN appointments a ON qt.appointment_id = a.id WHERE a.practitioner_id = $1', [practitionerId]);
  }

  // Patient
  if (patientProfileId) {
    await checkCount('patient_profiles', 'SELECT count(*) FROM patient_profiles WHERE id = $1', [patientProfileId]);
    await checkCount('patient_addresses', 'SELECT count(*) FROM patient_addresses WHERE patient_id = $1', [patientProfileId]);
    await checkCount('patient_allergies', 'SELECT count(*) FROM patient_allergies WHERE patient_id = $1', [patientProfileId]);
    await checkCount('patient_emergency_contacts', 'SELECT count(*) FROM patient_emergency_contacts WHERE patient_id = $1', [patientProfileId]);
    await checkCount('patient_timeline_events', 'SELECT count(*) FROM patient_timeline_events WHERE patient_id = $1', [patientProfileId]);
    await checkCount('medical_intake_submissions', 'SELECT count(*) FROM medical_intake_submissions WHERE patient_id = $1', [patientProfileId]);
    await checkCount('clinical_encounters (patient)', 'SELECT count(*) FROM clinical_encounters WHERE patient_id = $1', [patientProfileId]);
    await checkCount('appointments (as patient)', 'SELECT count(*) FROM appointments WHERE patient_id = $1', [patientProfileId]);
    await checkCount('queue_tickets (as patient)', 'SELECT count(*) FROM queue_tickets qt JOIN appointments a ON qt.appointment_id = a.id WHERE a.patient_id = $1', [patientProfileId]);
    await checkCount('public_testimonials', 'SELECT count(*) FROM public_testimonials WHERE patient_id = $1', [patientProfileId]);
  }

  // Outbox events
  const targetAggIds = [coreUserId, authUserId].filter(Boolean) as string[];
  if (targetAggIds.length > 0) {
    await checkCount(
      'outbox_events',
      'SELECT count(*) FROM outbox_events WHERE aggregate_id = ANY($1) OR payload::text LIKE $2',
      [targetAggIds, `%${email}%`],
    );
  }

  const totalDbRows = tableCounts.reduce((acc, curr) => acc + curr.rowCount, 0);

  // Check disk avatar files
  let avatarDirExists = false;
  let avatarDirPath: string | null = null;
  const potentialPaths = [
    coreUserId ? resolve(resolvedStorageRoot, 'avatars', coreUserId) : null,
    authUserId ? resolve(resolvedStorageRoot, 'avatars', authUserId) : null,
  ].filter(Boolean) as string[];

  for (const p of potentialPaths) {
    if (existsSync(p)) {
      avatarDirExists = true;
      avatarDirPath = p;
      break;
    }
  }

  // Check Redis keys
  let redisKeyCount = 0;
  if (redisClient) {
    try {
      const patterns = [
        coreUserId ? `*${coreUserId}*` : null,
        authUserId ? `*${authUserId}*` : null,
        `*${email}*`,
      ].filter(Boolean) as string[];

      const foundKeys = new Set<string>();
      for (const pat of patterns) {
        const keys = await redisClient.keys(pat);
        for (const k of keys) foundKeys.add(k);
      }
      redisKeyCount = foundKeys.size;
    } catch {
      redisKeyCount = 0;
    }
  }

  return {
    coreUserId,
    authUserId,
    email,
    name,
    roles,
    staffProfileId,
    practitionerId,
    patientProfileId,
    tableCounts,
    totalDbRows,
    avatarDirExists,
    avatarDirPath,
    redisKeyCount,
  };
}

// --- Purge Execution Engine ---

async function executeUserPurge(
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

    // Clean file assets from disk
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

    // Invalidate Redis keys
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

// --- Terminal UI Formatting Helpers ---

function printHeader(title: string): void {
  console.log('\n================================================================================');
  console.log(` [AMANAH DEV CLI] ${title}`);
  console.log('================================================================================');
}

function printSection(title: string): void {
  console.log(`\n--- ${title} ---`);
}

function padRight(str: string, len: number): string {
  if (str.length > len) return str.slice(0, len - 3) + '...';
  return str.padEnd(len, ' ');
}

function renderUsersTable(users: DiscoveredUser[]): void {
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

function renderInspectionResult(inspection: UserInspectionResult): void {
  printSection('User Relational Inspection');
  console.log(` Name        : ${inspection.name}`);
  console.log(` Email       : ${inspection.email}`);
  console.log(` Core ID     : ${inspection.coreUserId || '(none)'}`);
  console.log(` Auth ID     : ${inspection.authUserId || '(none)'}`);
  console.log(` Roles       : ${inspection.roles.length > 0 ? inspection.roles.join(', ') : 'none'}`);
  console.log(` Staff ID    : ${inspection.staffProfileId || '(none)'}`);
  console.log(` Doctor ID   : ${inspection.practitionerId || '(none)'}`);
  console.log(` Patient ID  : ${inspection.patientProfileId || '(none)'}`);

  console.log('\nRelational Records Found in Database:');
  const tblW = 38;
  const cntW = 8;
  console.log(padRight('Table Name', tblW) + ' ' + padRight('Rows', cntW));
  console.log('-'.repeat(tblW + cntW + 1));

  if (inspection.tableCounts.length === 0) {
    console.log(' (No records found across tables)');
  } else {
    for (const tc of inspection.tableCounts) {
      console.log(padRight(tc.tableName, tblW) + ' ' + padRight(String(tc.rowCount), cntW));
    }
  }

  console.log('-'.repeat(tblW + cntW + 1));
  console.log(`Total Database Rows to Purge : ${inspection.totalDbRows}`);
  console.log(`Disk Avatar Storage Exists   : ${inspection.avatarDirExists ? `YES (${inspection.avatarDirPath})` : 'NO'}`);
  console.log(`Redis Cache Keys Found       : ${inspection.redisKeyCount}`);
}

// --- Main Interactive CLI Loop ---

async function askSafeQuestion(rl: readline.Interface, prompt: string): Promise<string | null> {
  try {
    const ans = await rl.question(prompt);
    return ans !== undefined && ans !== null ? ans.trim() : null;
  } catch {
    return null;
  }
}

async function runInteractive(pool: Pool, redisClient: Redis | null): Promise<void> {
  const rl = readline.createInterface({ input, output });

  try {
    printHeader('SELECTIVE USER PURGE RUNNER');
    console.log('Operating Environment: DEVELOPMENT');
    console.log(`Connected Database   : ${dbHost}:${dbPort} / ${dbName}`);
    console.log(`Connected Redis      : ${redisClient ? `${redisHost}:${redisPort} (READY)` : 'UNREACHABLE (SKIPPED)'}`);

    let activeFilter: 'all' | 'mobile' | 'search' = 'all';
    let searchQuery = '';

    while (true) {
      const allUsers = await fetchAllUsers(pool);
      const mobileCount = allUsers.filter((u) => u.isMobile).length;

      printSection(`User Discovery [Total: ${allUsers.length} | Mobile: ${mobileCount}]`);
      console.log('Options:');
      console.log(' [1] List All Users');
      console.log(' [2] List Mobile Users Only');
      console.log(' [3] Search by Keyword (Name / Email / Role / ID)');
      console.log(' [4] Direct Input: Enter/Paste Email or UUID to Purge');
      console.log(' [q] Quit CLI\n');

      const choice = await askSafeQuestion(rl, 'Enter selection [1-4 or q]: ');
      if (choice === null || choice.toLowerCase() === 'q' || choice.toLowerCase() === 'exit') {
        console.log('\n[INFO] Exiting runner CLI. No changes made.\n');
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
        if (query === null) break;
        searchQuery = query;
        if (!searchQuery) continue;
        targetUsers = await fetchAllUsers(pool, { search: searchQuery });
        printSection(`Search Results for "${searchQuery}" (${targetUsers.length})`);
        renderUsersTable(targetUsers);
      } else if (choice === '4') {
        // Direct input mode
      } else {
        console.log('[WARN] Invalid option. Please choose 1, 2, 3, 4, or q.');
        continue;
      }

      // Selection prompt
      console.log('\nTo purge a user, you can:');
      console.log('- Enter the table row number (e.g. 1)');
      console.log('- Paste the exact Email (e.g. mobiletest1@gmail.com)');
      console.log('- Paste the exact User UUID (e.g. 5981c212-ebb0-4286-9514-db0519879b79)');
      console.log('- Or press Enter / "c" to cancel and return to menu.');

      const targetInput = await askSafeQuestion(rl, '\nSelect User to Purge: ');
      if (targetInput === null) break;
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

      // Inspection
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

      // Confirmation
      console.log('\n================================================================================');
      console.log(' [ACTION REQUIRED] CONFIRM PERMANENT PURGE');
      console.log('--------------------------------------------------------------------------------');
      console.log(` Target User : ${inspection.name} <${inspection.email}>`);
      console.log(` Total Rows  : ${inspection.totalDbRows} rows will be deleted from PostgreSQL.`);
      console.log(` Storage     : ${inspection.avatarDirExists ? 'Avatar directory will be deleted.' : 'No storage files.'}`);
      console.log(` Redis Cache : ${inspection.redisKeyCount > 0 ? `${inspection.redisKeyCount} cache keys will be evicted.` : 'No cache keys.'}`);
      console.log('================================================================================');

      const confirm = await askSafeQuestion(rl, 'Type "PURGE" or "y" to execute cascade purge, or "n" to abort: ');
      if (confirm === null) break;

      if (confirm.toUpperCase() !== 'PURGE' && confirm.toLowerCase() !== 'y') {
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
      if (continueAnswer === null || continueAnswer.toLowerCase() !== 'y') {
        console.log('\n[INFO] Exiting runner CLI. Goodbye.\n');
        break;
      }
    }
  } finally {
    rl.close();
  }
}

// --- CLI Entrypoint & Argument Handling ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const pool = createDbPool();
  const redisClient = await getRedisClient();

  try {
    if (args.includes('--help') || args.includes('-h')) {
      console.log(`Amanah Healthcare - Selective User Purge CLI

Usage:
  bun ./scripts/dev/purge-user.ts                 Launch interactive CLI mode
  bun ./scripts/dev/purge-user.ts --list          List all users
  bun ./scripts/dev/purge-user.ts --mobile        List mobile users only
  bun ./scripts/dev/purge-user.ts --email=<email> Inspect & purge user by email
  bun ./scripts/dev/purge-user.ts --id=<uuid>     Inspect & purge user by UUID

Options:
  --yes, -y       Skip confirmation prompt (for non-interactive batch runs)
  --help, -h      Show this help message
`);
      return;
    }

    if (args.includes('--list') || args.includes('-l')) {
      const users = await fetchAllUsers(pool);
      printHeader('USER DIRECTORY');
      renderUsersTable(users);
      return;
    }

    if (args.includes('--mobile') || args.includes('-m')) {
      const users = await fetchAllUsers(pool, { mobileOnly: true });
      printHeader('MOBILE USER DIRECTORY');
      renderUsersTable(users);
      return;
    }

    // Direct target execution via CLI arguments
    const emailArg = args.find((a) => a.startsWith('--email='))?.split('=')[1];
    const idArg = args.find((a) => a.startsWith('--id='))?.split('=')[1];
    const target = emailArg || idArg;

    if (target) {
      printHeader('TARGETED PURGE');
      const inspection = await inspectUserRecords(pool, target, redisClient);
      if (!inspection) {
        console.error(`[ERROR] User not found: ${target}`);
        process.exit(1);
      }
      renderInspectionResult(inspection);

      const skipConfirm = args.includes('--yes') || args.includes('-y');
      if (!skipConfirm) {
        const rl = readline.createInterface({ input, output });
        const confirm = (await rl.question('\nConfirm purge? [y/N]: ')).trim().toLowerCase();
        rl.close();
        if (confirm !== 'y') {
          console.log('[INFO] Purge aborted.');
          return;
        }
      }

      console.log('\n[INFO] Executing transactional purge...');
      const result = await executeUserPurge(pool, inspection, redisClient);
      if (result.success) {
        console.log(`[SUCCESS] Purged ${result.deletedRows} database rows for ${inspection.email}.`);
      } else {
        console.error(`[ERROR] Purge failed: ${result.error}`);
        process.exit(1);
      }
      return;
    }

    // Default: Interactive CLI
    await runInteractive(pool, redisClient);
  } finally {
    await pool.end();
    if (redisClient) {
      await redisClient.quit();
    }
  }
}

main().catch((err) => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});
