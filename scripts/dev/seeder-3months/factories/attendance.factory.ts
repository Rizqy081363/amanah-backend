import type { PoolClient } from 'pg';
import type { DbContext, CreatedStaff, TimelineDay } from '../types';

export async function seedAttendanceAndLeaves(
  client: PoolClient,
  ctx: DbContext,
  timeline: TimelineDay[],
  staffList: CreatedStaff[]
): Promise<void> {
  const roomPoliUmum = ctx.rooms.get('r_pu_01')?.id || ctx.rooms.values().next().value?.id;
  const unitPoliUmum = ctx.units.get('poli_umum')?.id || ctx.units.values().next().value?.id;
  const sessionMorning = ctx.sessions.get('pagi') || ctx.sessions.get('morning') || ctx.sessions.values().next().value;
  const sessionAfternoon = ctx.sessions.get('sore') || ctx.sessions.get('afternoon') || sessionMorning;

  // Single canonical administrator
  const adminStaff = staffList.find((s) => s.roleCode === 'admin');
  const adminUserId = adminStaff?.userId;

  // Clinical practitioners for shift replacements
  const doctors = staffList.filter((s) => s.practitionerId && (s.roleCode.includes('doctor') || s.department.includes('Keperawatan')));
  const midwives = staffList.filter((s) => s.practitionerId && (s.roleCode.includes('midwife') || s.roleCode.includes('specialist')));
  const nonAdminStaff = staffList.filter((s) => s.staffCode !== 'STF-ADM-001');

  // Track approved leaves for attendance and replacement linking
  const approvedLeaves: {
    id: string;
    staffProfileId: string;
    practitionerId?: string;
    startDate: string;
    endDate: string;
  }[] = [];

  // Completed replacement shifts tracking: Map<`${staffProfileId}_${date}`, boolean>
  const completedReplacements = new Map<string, boolean>();

  // ============================================================================
  // 1. SEED STAFF LEAVE REQUESTS MATRIX (approved, rejected, cancelled, pending)
  // ============================================================================
  interface LeaveDefinition {
    staffCode: string;
    type: 'annual_leave' | 'sick_leave' | 'seminar_symposium' | 'family_matter';
    dayOffset: number; // offset from day 0 in timeline
    duration: number;
    status: 'approved' | 'rejected' | 'cancelled' | 'pending';
    reason: string;
    rejectionReason?: string;
  }

  const leaveDefinitions: LeaveDefinition[] = [
    // Approved Leaves (Past dates)
    {
      staffCode: 'STF-DOK-001',
      type: 'seminar_symposium',
      dayOffset: 12,
      duration: 2,
      status: 'approved',
      reason: 'Menghadiri Simposium Nasional Penatalaksanaan Hipertensi & Diabetes IDI',
    },
    {
      staffCode: 'STF-BID-001',
      type: 'annual_leave',
      dayOffset: 24,
      duration: 3,
      status: 'approved',
      reason: 'Cuti tahunan untuk keperluan keluarga di Yogyakarta',
    },
    {
      staffCode: 'STF-DOK-002',
      type: 'sick_leave',
      dayOffset: 36,
      duration: 2,
      status: 'approved',
      reason: 'Sakit radang tenggorokan akut dan demam tinggi (Surat Dokter terlampir)',
    },
    {
      staffCode: 'STF-BID-002',
      type: 'family_matter',
      dayOffset: 48,
      duration: 2,
      status: 'approved',
      reason: 'Mendampingi orang tua rawat inap di rumah sakit rujukan',
    },
    {
      staffCode: 'STF-PRW-001',
      type: 'annual_leave',
      dayOffset: 58,
      duration: 2,
      status: 'approved',
      reason: 'Acara pernikahan adik kandung di Cirebon',
    },
    {
      staffCode: 'STF-CS-001',
      type: 'annual_leave',
      dayOffset: 68,
      duration: 3,
      status: 'approved',
      reason: 'Cuti tahunan hak semester berjalan',
    },
    {
      staffCode: 'STF-DOK-003',
      type: 'seminar_symposium',
      dayOffset: 76,
      duration: 2,
      status: 'approved',
      reason: 'Workshop USG Fetomaternal Tingkat Lanjut POGI Jawa Barat',
    },
    {
      staffCode: 'STF-DOK-001',
      type: 'annual_leave',
      dayOffset: 85,
      duration: 2,
      status: 'approved',
      reason: 'Izin cuti tahunan keluarga',
    },
    // Near-future / Today approved leave (for claimed & open replacements)
    {
      staffCode: 'STF-DOK-002',
      type: 'seminar_symposium',
      dayOffset: 91, // upcoming workday
      duration: 2,
      status: 'approved',
      reason: 'Pelatihan Sertifikasi ATLS Dokter Umum',
    },
    {
      staffCode: 'STF-BID-001',
      type: 'seminar_symposium',
      dayOffset: 95, // upcoming workday
      duration: 2,
      status: 'approved',
      reason: 'Pelatihan Resusitasi Neonatus IBI',
    },

    // Rejected Leaves (ditolak dengan catatan verifikator yang sah)
    {
      staffCode: 'STF-DOK-002',
      type: 'annual_leave',
      dayOffset: 20,
      duration: 3,
      status: 'rejected',
      reason: 'Pengajuan cuti tahunan di awal pekan sibuk poliklinik',
      rejectionReason: 'Ditolak: Kuota cuti dokter Poli Umum pada tanggal tersebut sudah melebihi batas operasional (dr. Zikri telah mengajukan cuti dinas).',
    },
    {
      staffCode: 'STF-CS-002',
      type: 'family_matter',
      dayOffset: 42,
      duration: 2,
      status: 'rejected',
      reason: 'Keperluan pribadi mendadak',
      rejectionReason: 'Ditolak: Permohonan izin cuti diajukan mendadak pada hari-H tanpa dokumen pendukung kedaruratan.',
    },
    {
      staffCode: 'STF-PRW-002',
      type: 'annual_leave',
      dayOffset: 62,
      duration: 4,
      status: 'rejected',
      reason: 'Liburan akhir pekan panjang bersama kerabat',
      rejectionReason: 'Ditolak: Bersamaan dengan jadwal visitasi audit mutu berkala internal klinik pratama.',
    },
    {
      staffCode: 'STF-HRD-001',
      type: 'seminar_symposium',
      dayOffset: 72,
      duration: 3,
      status: 'rejected',
      reason: 'Seminar eksternal manajemen SDM kesehatan',
      rejectionReason: 'Ditolak: Bertepatan dengan periode penutupan rekapitulasi presensi dan payroll bulanan pegawai.',
    },

    // Cancelled Leaves (dibatalkan pemohon)
    {
      staffCode: 'STF-BID-002',
      type: 'seminar_symposium',
      dayOffset: 30,
      duration: 2,
      status: 'cancelled',
      reason: 'Dibatalkan oleh pemohon: Jadwal seminar daring kegawatdaruratan neonatal ditunda oleh pihak penyelenggara ke bulan depan.',
    },
    {
      staffCode: 'STF-DOK-003',
      type: 'family_matter',
      dayOffset: 52,
      duration: 2,
      status: 'cancelled',
      reason: 'Dibatalkan oleh pemohon: Urusan keluarga di luar kota sudah selesai lebih awal pada hari Minggu.',
    },
    {
      staffCode: 'STF-KEU-001',
      type: 'annual_leave',
      dayOffset: 65,
      duration: 2,
      status: 'cancelled',
      reason: 'Dibatalkan oleh pemohon: Rekan kerja bagian keuangan berhalangan hadir sehingga jadwal cuti diundur.',
    },

    // Pending Leaves (menunggu persetujuan admin untuk jadwal mendatang)
    {
      staffCode: 'STF-DOK-001',
      type: 'annual_leave',
      dayOffset: 98,
      duration: 3,
      status: 'pending',
      reason: 'Rencana cuti tahunan akhir tahun bersama keluarga',
    },
    {
      staffCode: 'STF-PRW-001',
      type: 'seminar_symposium',
      dayOffset: 100,
      duration: 2,
      status: 'pending',
      reason: 'Mengikuti Pelatihan Bantuan Hidup Dasar (BHD) PPNI Jawa Barat',
    },
    {
      staffCode: 'STF-CS-001',
      type: 'family_matter',
      dayOffset: 102,
      duration: 2,
      status: 'pending',
      reason: 'Menghadiri wisuda adik kandung di Universitas Padjadjaran',
    },
  ];

  for (const def of leaveDefinitions) {
    const staff = staffList.find((s) => s.staffCode === def.staffCode);
    if (!staff) continue;

    const startIdx = Math.min(def.dayOffset, timeline.length - 1);
    const endIdx = Math.min(startIdx + def.duration - 1, timeline.length - 1);
    const startDay = timeline[startIdx];
    const endDay = timeline[endIdx];

    const isApproved = def.status === 'approved';
    const isRejected = def.status === 'rejected';
    const isCancelled = def.status === 'cancelled';
    const isPending = def.status === 'pending';

    const reviewedBy = (isApproved || isRejected) ? adminUserId : null;
    const reviewedAt = (isApproved || isRejected) ? `${startDay.date} 09:00:00+07` : null;
    const reviewerNotes = isApproved
      ? 'Disetujui. Pastikan koordinasi tugas dan shift pengganti telah didelegasikan.'
      : isRejected
        ? (def.rejectionReason || 'Ditolak: Kuota izin pada sesi tersebut sudah penuh.')
        : null;
    const cancelledAt = isCancelled ? `${startDay.date} 10:30:00+07` : null;

    const leaveRes = await client.query(
      `
      INSERT INTO staff_leave_requests (
        staff_profile_id, practitioner_id, request_type, start_date, end_date, duration_days,
        reason, status, reviewed_by, reviewed_at, reviewer_notes, cancelled_at, scope, decision_source, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'full_day', 'admin', $13, NOW())
      RETURNING id;
      `,
      [
        staff.staffProfileId,
        staff.practitionerId || null,
        def.type,
        startDay.date,
        endDay.date,
        def.duration,
        def.reason,
        def.status,
        reviewedBy,
        reviewedAt,
        reviewerNotes,
        cancelledAt,
        `${startDay.date} 08:00:00+07`,
      ]
    );
    const leaveRequestId = leaveRes.rows[0].id;

    if (isApproved) {
      approvedLeaves.push({
        id: leaveRequestId,
        staffProfileId: staff.staffProfileId,
        practitionerId: staff.practitionerId,
        startDate: startDay.date,
        endDate: endDay.date,
      });

      // 1b. Insert leave_request_sessions for each day of the leave
      for (let d = startIdx; d <= endIdx; d++) {
        const curDate = timeline[d].date;
        if (sessionMorning) {
          await client.query(
            `
            INSERT INTO leave_request_sessions (leave_request_id, session_id, work_date, created_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (leave_request_id, session_id, work_date) DO NOTHING;
            `,
            [leaveRequestId, sessionMorning.id, curDate]
          );
        }
      }
    }
  }

  // ============================================================================
  // 2. SEED REPLACEMENT OPPORTUNITIES (open, claimed, completed, cancelled)
  // ============================================================================
  // Generate replacement shifts from approved practitioner leaves
  let oppIndex = 0;
  for (const leave of approvedLeaves) {
    if (!leave.practitionerId) continue;

    const originalStaff = staffList.find((s) => s.staffProfileId === leave.staffProfileId);
    if (!originalStaff) continue;

    // Determine eligible replacement pool (peer of same clinical role, never self)
    const isDoctor = originalStaff.roleCode.includes('doctor');
    const peerPool = isDoctor
      ? doctors.filter((d) => d.staffProfileId !== originalStaff.staffProfileId)
      : midwives.filter((m) => m.staffProfileId !== originalStaff.staffProfileId);

    const substitutePeer = peerPool.length > 0 ? peerPool[oppIndex % peerPool.length] : null;
    oppIndex++;

    const isPast = leave.endDate < (timeline.find((t) => t.isToday)?.date || '');
    const sessionToReplace = sessionMorning?.id || sessionAfternoon?.id;
    if (!sessionToReplace) continue;

    // Distribute all 4 canonical replacement statuses
    let oppStatus: 'open' | 'claimed' | 'completed' | 'cancelled' = 'completed';
    let claimedByStaff: string | null = null;
    let claimedByPrac: string | null = null;
    let claimedAt: string | null = null;
    let notes: string | null = null;

    if (isPast) {
      if (oppIndex % 6 === 0) {
        // Cancelled opportunity
        oppStatus = 'cancelled';
        notes = 'Peluang shift ditutup karena penyesuaian rotasi dinas internal poliklinik.';
      } else {
        // Completed opportunity
        oppStatus = 'completed';
        if (substitutePeer) {
          claimedByStaff = substitutePeer.staffProfileId;
          claimedByPrac = substitutePeer.practitionerId || null;
          claimedAt = `${leave.startDate} 07:00:00+07`;
          notes = `Shift berhasil digantikan oleh ${substitutePeer.fullName}.`;
          completedReplacements.set(`${substitutePeer.staffProfileId}_${leave.startDate}`, true);
        }
      }
    } else {
      // Near future / upcoming leaves
      if (oppIndex % 2 === 0 && substitutePeer) {
        // Claimed opportunity
        oppStatus = 'claimed';
        claimedByStaff = substitutePeer.staffProfileId;
        claimedByPrac = substitutePeer.practitionerId || null;
        claimedAt = `${timeline.find((t) => t.isToday)?.date || leave.startDate} 08:30:00+07`;
        notes = `Shift telah diambil oleh ${substitutePeer.fullName}, menunggu pelaksanaan tugas.`;
      } else {
        // Open opportunity (bursa shift klinik)
        oppStatus = 'open';
        claimedByStaff = null;
        claimedByPrac = null;
        claimedAt = null;
        notes = 'Peluang shift pengganti terbuka untuk rekan sejawat berizin dinas.';
      }
    }

    await client.query(
      `
      INSERT INTO replacement_opportunities (
        leave_request_id, session_id, work_date,
        original_staff_profile_id, original_practitioner_id,
        claimed_by_staff_profile_id, claimed_by_practitioner_id, claimed_at,
        status, notes, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW());
      `,
      [
        leave.id,
        sessionToReplace,
        leave.startDate,
        originalStaff.staffProfileId,
        originalStaff.practitionerId,
        claimedByStaff,
        claimedByPrac,
        claimedAt,
        oppStatus,
        notes,
      ]
    );
  }

  // ============================================================================
  // 3. SEED DAILY QR SESSIONS & ATTENDANCE RECORDS (Past 90 Days + Today)
  // ============================================================================
  for (const day of timeline) {
    if (!day.isWorkday) continue; // Skip Sundays
    if (day.isFuture) continue;   // Future attendance has not occurred yet

    // Create morning QR session for this day
    const validFrom = `${day.date} 06:00:00+07`;
    const validUntil = `${day.date} 14:30:00+07`;
    const codeHash = `QR-AMN-${day.date.replace(/-/g, '')}-PAGI`;

    const qrRes = await client.query(
      `
      INSERT INTO attendance_qr_sessions (
        code_hash, session_type, room_id, unit_id, shift,
        valid_from, valid_until, rotation_seconds, is_active, created_by, created_at, updated_at
      )
      VALUES ($1, 'location_check_in', $2, $3, 'morning', $4, $5, 30, $6, $7, $4, $4)
      ON CONFLICT (code_hash) DO UPDATE
      SET is_active = EXCLUDED.is_active
      RETURNING id;
      `,
      [
        codeHash,
        roomPoliUmum || null,
        unitPoliUmum || null,
        validFrom,
        validUntil,
        day.isToday, // Only active if today
        adminUserId || null,
      ]
    );
    const qrSessionId = qrRes.rows[0].id;

    // For each staff member, record attendance
    for (const staff of staffList) {
      const activeLeave = approvedLeaves.find(
        (l) => l.staffProfileId === staff.staffProfileId &&
               day.date >= l.startDate &&
               day.date <= l.endDate
      );

      const isServingAsReplacement = completedReplacements.get(`${staff.staffProfileId}_${day.date}`) === true;

      let status: 'present' | 'late' | 'leave' | 'absent' = 'present';
      let checkInAt: string | null = null;
      let checkOutAt: string | null = null;
      let lateMinutes: number | null = 0;
      let durationHours = 7.5;
      let notes: string | null = 'Hadir shift pagi tepat waktu';
      let leaveRequestId: string | null = null;

      if (activeLeave) {
        status = 'leave';
        leaveRequestId = activeLeave.id;
        checkInAt = null;
        checkOutAt = null;
        lateMinutes = null;
        durationHours = 0;
        notes = 'Izin cuti dinas resmi disetujui';
      } else if (isServingAsReplacement) {
        status = 'present';
        checkInAt = `${day.date} 06:50:00+07`;
        checkOutAt = `${day.date} 14:20:00+07`;
        lateMinutes = 0;
        durationHours = 7.5;
        notes = 'Hadir bertugas sebagai pengganti shift rekan sejawat';
      } else if (day.isToday) {
        // TODAY
        status = 'present';
        checkInAt = `${day.date} 06:52:14+07`;
        checkOutAt = null; // Shift still active
        lateMinutes = 0;
        durationHours = 4.0;
        notes = 'Sedang bertugas (shift aktif hari ini)';
      } else {
        // Past workdays
        const seedVal = (day.dayIndex * 13 + staff.staffCode.charCodeAt(staff.staffCode.length - 1)) % 100;
        if (seedVal < 86) {
          status = 'present';
          const min = String(45 + (seedVal % 14)).padStart(2, '0');
          const sec = String(10 + (seedVal % 45)).padStart(2, '0');
          checkInAt = `${day.date} 06:${min}:${sec}+07`;
          checkOutAt = `${day.date} 14:15:${sec}+07`;
          lateMinutes = 0;
          durationHours = 7.4;
          notes = 'Presensi tervalidasi via QR Scanner';
        } else if (seedVal < 95) {
          status = 'late';
          const lateMin = 10 + (seedVal % 25);
          lateMinutes = lateMin;
          const min = String(lateMin).padStart(2, '0');
          checkInAt = `${day.date} 07:${min}:20+07`;
          checkOutAt = `${day.date} 14:30:15+07`;
          durationHours = 7.0;
          notes = `Terlambat ${lateMin} menit karena kendala perjalanan`;
        } else {
          status = 'absent';
          checkInAt = null;
          checkOutAt = null;
          lateMinutes = null;
          durationHours = 0;
          notes = 'Tidak melakukan presensi harian';
        }
      }

      await client.query(
        `
        INSERT INTO staff_attendance_records (
          staff_profile_id, qr_session_id, leave_request_id, unit_id, room_id,
          attendance_date, shift, status, expected_check_in_at, check_in_at, check_out_at,
          late_minutes, recorded_method, location_label, notes, session_id,
          validated_duration_hours, is_replacement, is_early_departure, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'morning', $7, $8, $9, $10, $11, 'qr_scan', 'Klinik Pratama Amanah', $12, $13, $14, $15, false, NOW(), NOW())
        ON CONFLICT (staff_profile_id, attendance_date, shift) DO UPDATE
        SET status = EXCLUDED.status,
            check_in_at = EXCLUDED.check_in_at,
            check_out_at = EXCLUDED.check_out_at,
            late_minutes = EXCLUDED.late_minutes,
            validated_duration_hours = EXCLUDED.validated_duration_hours,
            is_replacement = EXCLUDED.is_replacement,
            notes = EXCLUDED.notes,
            updated_at = NOW();
        `,
        [
          staff.staffProfileId,
          qrSessionId,
          leaveRequestId,
          unitPoliUmum || null,
          roomPoliUmum || null,
          day.date,
          status,
          `${day.date} 07:00:00+07`,
          checkInAt,
          checkOutAt,
          lateMinutes,
          notes,
          sessionMorning?.id || null,
          durationHours,
          isServingAsReplacement,
        ]
      );
    }
  }
}
