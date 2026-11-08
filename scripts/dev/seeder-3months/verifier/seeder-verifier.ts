import type { PoolClient } from 'pg';
import { nikSecurityService } from '../core/nik-helper';

export interface VerificationResult {
  passed: boolean;
  brokenFkCount: number;
  adminCount: number;
  nikIntegrityPassed: boolean;
  leaveMatrixPassed: boolean;
  replacementMatrixPassed: boolean;
  tableCounts: Record<string, number>;
  checks: { name: string; brokenCount: number }[];
  leaveStatusCounts: Record<string, number>;
  replacementStatusCounts: Record<string, number>;
}

export async function verifySeederIntegrity(client: PoolClient): Promise<VerificationResult> {
  const fkChecks = [
    {
      name: 'appointments -> patient_profiles',
      query: 'SELECT count(*)::int AS count FROM appointments WHERE patient_id NOT IN (SELECT id FROM patient_profiles);',
    },
    {
      name: 'clinical_encounters -> appointments',
      query: 'SELECT count(*)::int AS count FROM clinical_encounters WHERE appointment_id NOT IN (SELECT id FROM appointments);',
    },
    {
      name: 'queue_tickets -> appointments',
      query: 'SELECT count(*)::int AS count FROM queue_tickets WHERE appointment_id NOT IN (SELECT id FROM appointments);',
    },
    {
      name: 'staff_attendance_records -> staff_profiles',
      query: 'SELECT count(*)::int AS count FROM staff_attendance_records WHERE staff_profile_id NOT IN (SELECT id FROM staff_profiles);',
    },
    {
      name: 'payroll_entries -> payroll_periods',
      query: 'SELECT count(*)::int AS count FROM payroll_entries WHERE payroll_period_id NOT IN (SELECT id FROM payroll_periods);',
    },
    {
      name: 'patient_affiliations -> patient_profiles',
      query: 'SELECT count(*)::int AS count FROM patient_affiliations WHERE patient_id NOT IN (SELECT id FROM patient_profiles);',
    },
    {
      name: 'patient_affiliations -> users',
      query: 'SELECT count(*)::int AS count FROM patient_affiliations WHERE user_id NOT IN (SELECT id FROM users);',
    },
    {
      name: 'replacement_opportunities -> staff_leave_requests',
      query: 'SELECT count(*)::int AS count FROM replacement_opportunities WHERE leave_request_id NOT IN (SELECT id FROM staff_leave_requests);',
    },
    {
      name: 'leave_request_sessions -> staff_leave_requests',
      query: 'SELECT count(*)::int AS count FROM leave_request_sessions WHERE leave_request_id NOT IN (SELECT id FROM staff_leave_requests);',
    },
    {
      name: 'messages -> conversations',
      query: 'SELECT count(*)::int AS count FROM messages WHERE conversation_id NOT IN (SELECT id FROM conversations);',
    },
  ];

  let totalBroken = 0;
  const checkResults: { name: string; brokenCount: number }[] = [];

  for (const check of fkChecks) {
    const res = await client.query<{ count: number }>(check.query);
    const broken = res.rows[0]?.count || 0;
    totalBroken += broken;
    checkResults.push({ name: check.name, brokenCount: broken });
  }

  // 1. Single Administrator Invariant Check
  const adminRes = await client.query<{ count: number }>(`
    SELECT count(*)::int AS count 
    FROM user_roles ur 
    JOIN roles r ON r.id = ur.role_id 
    WHERE r.code = 'admin' AND ur.revoked_at IS NULL;
  `);
  const adminCount = adminRes.rows[0]?.count || 0;

  // 2. NIK Cryptographic & Decryption Integrity Check
  const nikSamplesRes = await client.query<{
    type: string;
    national_id_hash: string;
    national_id_encrypted: string;
  }>(`
    SELECT 'patient' as type, national_id_hash, national_id_encrypted 
    FROM patient_profiles 
    WHERE national_id_hash IS NOT NULL AND national_id_encrypted IS NOT NULL
    UNION ALL
    SELECT 'staff' as type, national_id_hash, national_id_encrypted 
    FROM staff_profiles 
    WHERE national_id_hash IS NOT NULL AND national_id_encrypted IS NOT NULL;
  `);

  let nikIntegrityPassed = nikSamplesRes.rows.length > 0;
  for (const row of nikSamplesRes.rows) {
    const decrypted = nikSecurityService.decrypt(row.national_id_encrypted);
    if (!decrypted || !/^\d{16}$/.test(decrypted)) {
      nikIntegrityPassed = false;
      break;
    }
    const computedBlindIndex = nikSecurityService.computeBlindIndex(decrypted);
    if (computedBlindIndex !== row.national_id_hash) {
      nikIntegrityPassed = false;
      break;
    }
  }

  // 3. Leave Requests Matrix Check (approved, rejected, cancelled, pending)
  const leaveRes = await client.query<{ status: string; count: number }>(`
    SELECT status, count(*)::int AS count FROM staff_leave_requests GROUP BY status;
  `);
  const leaveStatusCounts: Record<string, number> = {};
  for (const r of leaveRes.rows) {
    leaveStatusCounts[r.status] = r.count;
  }
  const leaveMatrixPassed =
    (leaveStatusCounts['approved'] || 0) > 0 &&
    (leaveStatusCounts['rejected'] || 0) > 0 &&
    (leaveStatusCounts['cancelled'] || 0) > 0 &&
    (leaveStatusCounts['pending'] || 0) > 0;

  // 4. Replacement Opportunities Matrix Check (open, claimed, completed, cancelled)
  const replRes = await client.query<{ status: string; count: number }>(`
    SELECT status, count(*)::int AS count FROM replacement_opportunities GROUP BY status;
  `);
  const replacementStatusCounts: Record<string, number> = {};
  for (const r of replRes.rows) {
    replacementStatusCounts[r.status] = r.count;
  }
  const replacementMatrixPassed =
    (replacementStatusCounts['open'] || 0) > 0 &&
    (replacementStatusCounts['claimed'] || 0) > 0 &&
    (replacementStatusCounts['completed'] || 0) > 0 &&
    (replacementStatusCounts['cancelled'] || 0) > 0;

  const tablesToCount = [
    'users',
    'staff_profiles',
    'practitioners',
    'patient_profiles',
    'patient_affiliations',
    'patient_addresses',
    'staff_credentials',
    'staff_attendance_records',
    'staff_leave_requests',
    'leave_request_sessions',
    'replacement_opportunities',
    'appointments',
    'queue_tickets',
    'clinical_encounters',
    'payroll_periods',
    'payroll_entries',
    'conversations',
    'messages',
    'support_tickets',
    'notifications',
  ];

  const tableCounts: Record<string, number> = {};
  for (const tbl of tablesToCount) {
    const res = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${tbl};`);
    tableCounts[tbl] = res.rows[0]?.count || 0;
  }

  const overallPassed =
    totalBroken === 0 &&
    adminCount === 1 &&
    nikIntegrityPassed &&
    leaveMatrixPassed &&
    replacementMatrixPassed;

  return {
    passed: overallPassed,
    brokenFkCount: totalBroken,
    adminCount,
    nikIntegrityPassed,
    leaveMatrixPassed,
    replacementMatrixPassed,
    tableCounts,
    checks: checkResults,
    leaveStatusCounts,
    replacementStatusCounts,
  };
}
