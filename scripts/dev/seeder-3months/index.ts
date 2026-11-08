#!/usr/bin/env bun
/**
 * Amanah Healthcare — 3-Month Relational Ecosystem Seeder
 * Pure Relational Factory Engine (90-Day Continuous Historical Simulation)
 *
 * Scope: Monorepo Backend (PostgreSQL & Redis)
 * Invariants: Zero Hardcoding, 100% Valid Foreign Keys, Zero DDL Mutation.
 */

import { initDbContext, flushOperationalTables, flushRedisCaches } from './core/db-context';
import { generate90DayTimeline } from './core/calendar-timeline';
import { seedStaffAndPractitioners } from './factories/staff.factory';
import { seedPatientsAndAffiliations } from './factories/patient.factory';
import { seedAttendanceAndLeaves } from './factories/attendance.factory';
import { seedClinicalAppointmentsAndEncounters } from './factories/clinical.factory';
import { seedPayroll } from './factories/payroll.factory';
import { seedCommunicationAndNotifications } from './factories/communication.factory';
import { verifySeederIntegrity } from './verifier/seeder-verifier';

async function main() {
  const startTime = Date.now();

  console.log('================================================================================');
  console.log('  AMANAH HEALTHCARE — 3-MONTH RELATIONAL ECOSYSTEM SEEDER');
  console.log('  Framework: Relational Factory Engine · Database: PostgreSQL (Live)');
  console.log('================================================================================');

  const ctx = await initDbContext();
  const timeline = generate90DayTimeline(new Date());
  const client = await ctx.pool.connect();

  console.log(`[Config] Timeline Span    : 90 Days (${timeline[0].date} s.d. ${timeline[timeline.length - 1].date})`);
  console.log(`[Config] Master Services  : ${ctx.services.size} services active`);
  console.log(`[Config] Master Rooms     : ${ctx.rooms.size} rooms active`);
  console.log(`[Config] Master Sessions  : ${ctx.sessions.size} session definitions`);
  console.log('--------------------------------------------------------------------------------');

  try {
    await client.query('BEGIN');

    // 1. Cold-start flush
    console.log('[1/6] Cold-Start Flush: Membersihkan tabel operasional secara aman (TRUNCATE CASCADE)...');
    await flushOperationalTables(client);
    console.log('      [✓] Tabel operasional bersih & siap diinjeksi.');

    // 2. Staff and Patients
    console.log('[2/6] Identity Seeding: Menghasilkan staf medis, admin, & profil keluarga pasien...');
    const staffList = await seedStaffAndPractitioners(client, ctx);
    console.log(`      [✓] ${staffList.length} Staf internal & praktisi klinis berhasil didaftarkan.`);

    const patients = await seedPatientsAndAffiliations(client, ctx);
    console.log(`      [✓] ${patients.length} Profil pasien & relasi afiliasi keluarga berhasil dihubungkan.`);

    // 3. Attendance & Leaves
    console.log('[3/6] HR & Presensi: Mengisi simulasi presensi kerja 90 hari & permohonan cuti...');
    await seedAttendanceAndLeaves(client, ctx, timeline, staffList);
    console.log('      [✓] Riwayat presensi harian staf (hadir, telat, izin) & sesi QR tersimpan.');

    // 4. Clinical, Appointments & EMR SOAP
    console.log('[4/6] Pelayanan Klinis: Menghasilkan janji temu, antrean berurutan, & rekam medis SOAP...');
    const totalEncounters = await seedClinicalAppointmentsAndEncounters(client, ctx, timeline, staffList, patients);
    console.log(`      [✓] Janji temu, tiket antrean, & ${totalEncounters} Rekam Medis Elektronik (SOAP) tersimpan.`);

    // 5. Payroll
    console.log('[5/6] Keuangan & Payroll: Menghitung 3 periode penggajian & entri rincian gaji...');
    const totalPayrollEntries = await seedPayroll(client, ctx, staffList);
    console.log(`      [✓] 3 Periode penggajian & ${totalPayrollEntries} entri rincian payroll terbit.`);

    // 6. Communication, Support & Notifications
    console.log('[6/6] Komunikasi & Layanan: Mengisi riwayat chat, tiket bantuan, & notifikasi...');
    await seedCommunicationAndNotifications(client, ctx, timeline, staffList, patients);
    console.log('      [✓] Percakapan chat, tiket bantuan pelanggan, & riwayat notifikasi tersimpan.');

    await client.query('COMMIT');
    console.log('--------------------------------------------------------------------------------');
    console.log('[✓] TRANSAKSI DATABASE SELESAI (100% COMMITTED)');

    // Invalidate Redis
    console.log('[Cache] Menginvalidasi tag & key Redis...');
    await flushRedisCaches(ctx.redis);
    console.log('      [✓] Cache Redis berhasil dibersihkan.');

    // Verification
    console.log('--------------------------------------------------------------------------------');
    console.log('[Verification] Menjalankan audit integritas foreign key, NIK crypto, & role admin...');
    const verif = await verifySeederIntegrity(client);

    console.log('\n  TABEL DATA OPERASIONAL TERCATAT:');
    for (const [tbl, count] of Object.entries(verif.tableCounts)) {
      console.log(`    - ${tbl.padEnd(28)}: ${count.toLocaleString('id-ID')} baris`);
    }

    console.log('\n  AUDIT INVARIAN ARSITEKTUR & KEAMANAN:');
    console.log(`    ${verif.adminCount === 1 ? '[PASS]' : '[FAIL]'} Single Admin Invariant: ${verif.adminCount} administrator terdaftar (Expected: 1)`);
    console.log(`    ${verif.nikIntegrityPassed ? '[PASS]' : '[FAIL]'} NIK Cryptography (HMAC-SHA256 & AES-256-GCM): 100% Valid & Reversible`);
    console.log(`    ${verif.leaveMatrixPassed ? '[PASS]' : '[FAIL]'} Matriks Perizinan Staf:`, JSON.stringify(verif.leaveStatusCounts));
    console.log(`    ${verif.replacementMatrixPassed ? '[PASS]' : '[FAIL]'} Matriks Peluang Pengganti:`, JSON.stringify(verif.replacementStatusCounts));

    console.log('\n  HASIL PEMERIKSAAN FOREIGN KEY:');
    for (const check of verif.checks) {
      const status = check.brokenCount === 0 ? '[PASS]' : '[FAIL]';
      console.log(`    ${status} ${check.name}: ${check.brokenCount} orphan records`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('================================================================================');
    if (verif.passed) {
      console.log(`[SUCCESS] Seeding 3 Bulan Berhasil 100%! Total Durasi: ${elapsed} detik.`);
    } else {
      console.error(`[WARNING] Seeding Selesai dengan peringatan integritas! Durasi: ${elapsed} detik.`);
    }
    console.log('================================================================================');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n[FATAL] Gagal mengeksekusi seeding. Transaksi telah di-rollback penuh:', err);
    process.exit(1);
  } finally {
    client.release();
    await ctx.pool.end();
    if (ctx.redis) ctx.redis.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
