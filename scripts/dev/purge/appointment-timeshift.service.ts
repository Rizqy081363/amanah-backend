import type * as readline from 'node:readline/promises';
import { Pool } from 'pg';
import type Redis from 'ioredis';
import { invalidateRedisTagsAndPrefixes } from './db-connection';
import { printSection, askSafeQuestion } from './purge-helpers';
import { renderAppointmentsTable } from './appointment-purge.render';
import type { UserAppointmentDetail } from './appointment-purge.service';

export interface AppointmentSnapshot {
  id: string;
  bookingCode: string;
  patientName: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  status: string;
}

export async function fetchActiveAppointmentsForShift(
  pool: Pool,
): Promise<UserAppointmentDetail[]> {
  const query = `
    SELECT 
      a.id,
      a.booking_code,
      TO_CHAR(a.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
      COALESCE(TO_CHAR(a.scheduled_start_time, 'HH24:MI'), '-') AS session,
      a.status,
      p.full_name AS patient_name,
      COALESCE(s.name, '-') AS service_name,
      COALESCE(prac.display_name, pr.full_name, u_doc.name, '-') AS practitioner_name,
      COALESCE(qt.queue_number, '-') AS queue_number
    FROM appointments a
    JOIN patient_profiles p ON a.patient_id = p.id
    LEFT JOIN clinic_services s ON a.service_id = s.id
    LEFT JOIN practitioners prac ON a.practitioner_id = prac.id
    LEFT JOIN staff_profiles pr ON prac.staff_profile_id = pr.id
    LEFT JOIN users u_doc ON pr.user_id = u_doc.id
    LEFT JOIN queue_tickets qt ON qt.appointment_id = a.id
    WHERE a.status IN ('booked', 'waiting', 'late')
    ORDER BY a.scheduled_date DESC, a.created_at DESC
    LIMIT 20;
  `;

  const res = await pool.query(query);
  return res.rows.map((r) => ({
    id: String(r.id),
    bookingCode: String(r.booking_code),
    scheduledDate: String(r.scheduled_date),
    session: String(r.session),
    status: String(r.status),
    patientName: String(r.patient_name),
    serviceName: String(r.service_name),
    practitionerName: String(r.practitioner_name),
    queueNumber: String(r.queue_number),
  }));
}

export async function runAppointmentTimeShiftInteractive(
  pool: Pool,
  redisClient: Redis | null,
  rl: readline.Interface,
): Promise<void> {
  printSection('SIMULASI PERGESERAN WAKTU JANJI TEMU (TIME-SHIFT & AUTO-REVERT)');
  console.log('Fungsi ini menggeser tanggal & jam janji temu ke masa lalu (H-1 / 24 jam lalu)');
  console.log('agar sistem secara ALAMI dan NATURAL mengevaluasi status keterlambatan (LATE).');
  console.log('Tidak ada jam Docker/OS yang diubah, dan data asli DIJAMIN dapat di-Auto-Revert!\n');

  const appts = await fetchActiveAppointmentsForShift(pool);
  if (appts.length === 0) {
    console.log('[INFO] Tidak ada janji temu aktif (booked/waiting/late) untuk disimulasikan.\n');
    return;
  }

  renderAppointmentsTable(appts);

  const rowChoice = await askSafeQuestion(
    rl,
    `\nPilih baris janji temu untuk disimulasikan [1-${appts.length} atau c untuk batal]: `,
  );
  if (!rowChoice || rowChoice.toLowerCase() === 'c') return;

  const rowIdx = parseInt(rowChoice, 10);
  if (isNaN(rowIdx) || rowIdx < 1 || rowIdx > appts.length) {
    console.log('[WARN] Pilihan baris tidak valid.');
    return;
  }

  const target = appts[rowIdx - 1];

  // Capture original snapshot from DB
  const snapRes = await pool.query(
    `SELECT id, booking_code, TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date, 
            TO_CHAR(scheduled_start_time, 'HH24:MI') AS scheduled_start_time,
            TO_CHAR(scheduled_end_time, 'HH24:MI') AS scheduled_end_time,
            status
     FROM appointments WHERE id = $1`,
    [target.id],
  );

  if (snapRes.rows.length === 0) {
    console.log('[ERROR] Janji temu tidak ditemukan di database.');
    return;
  }

  const snapshot: AppointmentSnapshot = {
    id: String(snapRes.rows[0].id),
    bookingCode: String(snapRes.rows[0].booking_code),
    patientName: target.patientName,
    scheduledDate: String(snapRes.rows[0].scheduled_date),
    scheduledStartTime: snapRes.rows[0].scheduled_start_time,
    scheduledEndTime: snapRes.rows[0].scheduled_end_time,
    status: String(snapRes.rows[0].status),
  };

  console.log(`\nSnapshot Data Asli Tersimpan:`);
  console.log(` - Booking Code  : ${snapshot.bookingCode} (${snapshot.patientName})`);
  console.log(` - Tanggal Asli  : ${snapshot.scheduledDate}`);
  console.log(` - Jam Sesi Asli : ${snapshot.scheduledStartTime || '-'} - ${snapshot.scheduledEndTime || '-'}`);
  console.log(` - Status Asli   : ${snapshot.status}\n`);

  console.log('Pilih Model Pergeseran Waktu (Time-Shift):');
  console.log(' [1] Geser 24 Jam ke Belakang (H-1 / Kemarin) -> Terlambat Alami (Default)');
  console.log(' [2] Geser 2 Jam ke Belakang Hari Ini (Lewat Jam Sesi)');
  console.log(' [c] Batal\n');

  const shiftMode = await askSafeQuestion(rl, 'Pilih mode pergeseran [1-2 atau c]: ');
  if (!shiftMode || shiftMode.toLowerCase() === 'c') return;

  if (shiftMode === '1') {
    await pool.query(
      `UPDATE appointments
       SET scheduled_date = (CURRENT_DATE - INTERVAL '1 day')::date,
           scheduled_start_time = '08:00',
           scheduled_end_time = '08:30',
           updated_at = NOW()
       WHERE id = $1`,
      [snapshot.id],
    );
    console.log(`\n[SUCCESS] Tanggal janji temu ${snapshot.bookingCode} digeser ke KEMARIN (H-1).`);
  } else if (shiftMode === '2') {
    await pool.query(
      `UPDATE appointments
       SET scheduled_date = CURRENT_DATE,
           scheduled_start_time = TO_CHAR(NOW() - INTERVAL '2 hours', 'HH24:MI'),
           scheduled_end_time = TO_CHAR(NOW() - INTERVAL '90 minutes', 'HH24:MI'),
           updated_at = NOW()
       WHERE id = $1`,
      [snapshot.id],
    );
    console.log(`\n[SUCCESS] Jam janji temu ${snapshot.bookingCode} digeser ke 2 JAM YANG LALU.`);
  } else {
    console.log('[WARN] Pilihan tidak valid.');
    return;
  }

  await invalidateRedisTagsAndPrefixes(redisClient, ['appointments', 'queue']);

  console.log(`\n--------------------------------------------------------------------------------`);
  console.log(` Status Waktu Sekarang : SUDAH DI MASA LALU (EXPIRED)`);
  console.log(` Background Scheduler  : AppointmentLateSweepScheduler berjalan setiap 2 menit`);
  console.log(`                         Status akan disapu menjadi 'late' secara natural!`);
  console.log(`--------------------------------------------------------------------------------\n`);

  console.log('Silakan buka browser Anda dan amati status janji temu di halaman Antrean / Klinik.');
  console.log('Setelah Anda selesai menguji, sistem dapat langsung mengembalikan data ke jadwal semula.\n');

  const revertPrompt = await askSafeQuestion(
    rl,
    'Tekan [r] untuk REVERT otomatis kembali ke jadwal & status awal (atau [q] untuk biarkan): ',
  );

  if (!revertPrompt || revertPrompt.toLowerCase() === 'r' || revertPrompt.toLowerCase() === 'revert') {
    console.log('\n[INFO] Menjalankan Auto-Revert ke snapshot asli...');
    await pool.query(
      `UPDATE appointments
       SET scheduled_date = $1::date,
           scheduled_start_time = $2,
           scheduled_end_time = $3,
           status = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [
        snapshot.scheduledDate,
        snapshot.scheduledStartTime,
        snapshot.scheduledEndTime,
        snapshot.status,
        snapshot.id,
      ],
    );

    // Clean up status events created during test
    await pool.query(
      `DELETE FROM appointment_status_events 
       WHERE appointment_id = $1 AND reason LIKE '%Terlambat hadir%'`,
      [snapshot.id],
    );

    // If ticket was skipped, restore to waiting
    await pool.query(
      `UPDATE queue_tickets 
       SET status = 'waiting', updated_at = NOW() 
       WHERE appointment_id = $1 AND status = 'skipped'`,
      [snapshot.id],
    );

    await invalidateRedisTagsAndPrefixes(redisClient, ['appointments', 'queue']);

    console.log(`[SUCCESS] 100% AUTO-REVERT SELESAI!`);
    console.log(`Janji temu ${snapshot.bookingCode} telah dipulihkan ke tanggal ${snapshot.scheduledDate} status '${snapshot.status}'.`);
    console.log(`Database kembali bersih 100% tanpa sampah test.\n`);
  } else {
    console.log(`\n[INFO] Data dibiarkan dalam kondisi simulasi masa lalu. Anda dapat me-revert kapan saja via menu ini.\n`);
  }
}
