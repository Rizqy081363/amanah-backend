import type { PoolClient } from 'pg';
import type { DbContext, CreatedStaff, CreatedPatient, TimelineDay } from '../types';

export async function seedCommunicationAndNotifications(
  client: PoolClient,
  ctx: DbContext,
  timeline: TimelineDay[],
  staffList: CreatedStaff[],
  patients: CreatedPatient[]
): Promise<void> {
  const csStaff = staffList.find((s) => s.roleCode === 'customer_service') || staffList[0];
  const adminUser = staffList.find((s) => s.roleCode === 'admin')?.userId || staffList[0].userId;

  // Filter unique family heads (who have user accounts)
  const familyHeads = patients.filter((p) => p.relationshipCode === 'self');

  // 1. Seed Conversations & Messages (12 conversation threads)
  const conversationSamples = [
    {
      topic: 'Jadwal Dokter & Poliklinik',
      messages: [
        { sender: 'patient', text: 'Selamat pagi admin, apakah dokter spesialis kandungan buka praktek hari ini?' },
        { sender: 'staff', text: 'Selamat pagi Ibu, dr. Hendra Wijaya, Sp.OG praktek di Poliklinik KIA hari ini pada Sesi Sore pukul 14.00 - 18.00 WIB.' },
        { sender: 'patient', text: 'Baik terima kasih infonya, saya sudah booking melalui aplikasi.' },
        { sender: 'staff', text: 'Sama-sama Ibu, silakan datang 15 menit sebelum estimasi waktu pemeriksaan ya. Sehat selalu.' },
      ],
    },
    {
      topic: 'Konfirmasi Vaksin Balita',
      messages: [
        { sender: 'patient', text: 'Halo admin, apakah stok vaksin DPT-HB-Hib untuk anak usia 2 bulan tersedia?' },
        { sender: 'staff', text: 'Halo Bapak/Ibu, stok vaksin DPT-HB-Hib dan Polio tersedia lengkap di poli KIA.' },
        { sender: 'patient', text: 'Terima kasih informasinya, kami jadwalkan kunjungan besok pagi.' },
      ],
    },
    {
      topic: 'Pertanyaan Hasil Pemeriksaan Darah',
      messages: [
        { sender: 'patient', text: 'Siang dokter, hasil laboratorium darah saya kemarin apakah sudah bisa dilihat di rekam medis?' },
        { sender: 'staff', text: 'Siang, hasil lab sudah terunggah di rekam medis aplikasi Anda. Kadar gula darah puasa dan kolesterol sudah dalam batas normal.' },
        { sender: 'patient', text: 'Alhamdulillah, terima kasih banyak dokter.' },
      ],
    },
  ];

  for (let i = 0; i < Math.min(familyHeads.length, 12); i++) {
    const head = familyHeads[i];
    const sample = conversationSamples[i % conversationSamples.length];
    const isClosed = i < 8; // Older are closed, recent are open
    const day = timeline[Math.max(0, timeline.length - 20 + i)];
    const closedAt = isClosed ? `${day.date} 11:00:00+07` : null;
    const createdAt = `${day.date} 09:00:00+07`;
    const lastMsgAt = `${day.date} 10:30:00+07`;

    const convRes = await client.query(
      `
      INSERT INTO conversations (
        patient_id, assigned_staff_id, user_id, status, last_message_at, closed_at,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id;
      `,
      [
        head.patientProfileId,
        csStaff.staffProfileId,
        head.familyHeadUserId,
        isClosed ? 'closed' : 'open',
        lastMsgAt,
        closedAt,
        createdAt,
      ]
    );
    const convId = convRes.rows[0].id;

    // Add conversation participants
    await client.query(
      `
      INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at, created_at, updated_at)
      VALUES 
        ($1, $2, 'patient', $4, NOW(), NOW()),
        ($1, $3, 'staff', $4, NOW(), NOW())
      ON CONFLICT DO NOTHING;
      `,
      [convId, head.familyHeadUserId, csStaff.userId, createdAt]
    );

    // Add messages
    for (let mIdx = 0; mIdx < sample.messages.length; mIdx++) {
      const msg = sample.messages[mIdx];
      const isFromPatient = msg.sender === 'patient';
      const senderUserId = isFromPatient ? head.familyHeadUserId : csStaff.userId;
      const authorName = isFromPatient ? head.fullName : csStaff.fullName;
      const msgTime = `${day.date} 09:${String(10 + mIdx * 5).padStart(2, '0')}:00+07`;

      await client.query(
        `
        INSERT INTO messages (
          conversation_id, sender_user_id, sender_type, author_snapshot, type,
          body, sender_role, created_at, updated_at
        )
        VALUES ($1, $2, 'user', $3, 'text', $4, $5, $6, $6);
        `,
        [
          convId,
          senderUserId,
          authorName,
          msg.text,
          isFromPatient ? 'external' : 'internal',
          msgTime,
        ]
      );
    }
  }

  // 2. Seed Support Tickets (6 tickets)
  const ticketPresets = [
    {
      title: 'Permohonan Reschedule Janji Temu Imunisasi',
      desc: 'Mohon izin memindahkan jadwal imunisasi anak karena ada agenda dinas luar kota mendadak.',
      status: 'resolved',
      priority: 'normal',
    },
    {
      title: 'Pertanyaan Rincian Tagihan Pemeriksaan Lab',
      desc: 'Mohon penjelasan rincian biaya pemeriksaan hematologi rutin pada struk pendaftaran.',
      status: 'resolved',
      priority: 'normal',
    },
    {
      title: 'Kendala Akses Unduh Surat Keterangan Sehat',
      desc: 'File PDF surat keterangan sehat tidak muncul tombol unduhnya di aplikasi mobile.',
      status: 'resolved',
      priority: 'high',
    },
    {
      title: 'Konfirmasi Perubahan Data Golongan Darah',
      desc: 'Terdapat perbedaan data golongan darah pada profil aplikasi dengan kartu PMI.',
      status: 'in_progress',
      priority: 'normal',
    },
  ];

  for (let i = 0; i < ticketPresets.length; i++) {
    const tp = ticketPresets[i];
    const head = familyHeads[i % familyHeads.length];
    const ticketNum = `TCK-2026-${String(i + 1).padStart(4, '0')}`;
    const day = timeline[Math.max(0, timeline.length - 25 + i * 4)];

    const resolvedAt = tp.status === 'resolved' ? `${day.date} 11:30:00+07` : null;
    const ticketCreatedAt = `${day.date} 11:00:00+07`;

    const ticketRes = await client.query(
      `
      INSERT INTO support_tickets (
        ticket_number, reporter_user_id, assigned_staff_id, title, description,
        status, priority, source_channel, resolved_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'mobile_app', $8, $9, NOW())
      RETURNING id;
      `,
      [
        ticketNum,
        head.familyHeadUserId,
        csStaff.staffProfileId,
        tp.title,
        tp.desc,
        tp.status,
        tp.priority,
        resolvedAt,
        ticketCreatedAt,
      ]
    );
    const ticketId = ticketRes.rows[0].id;

    // Insert user reporter message
    await client.query(
      `
      INSERT INTO support_ticket_messages (
        ticket_id, sender_user_id, sender_type, body, created_at, updated_at
      )
      VALUES ($1, $2, 'reporter', $3, $4, NOW());
      `,
      [ticketId, head.familyHeadUserId, tp.desc, ticketCreatedAt]
    );

    // Insert staff support reply message
    await client.query(
      `
      INSERT INTO support_ticket_messages (
        ticket_id, sender_user_id, sender_type, body, created_at, updated_at
      )
      VALUES ($1, $2, 'support_agent', 'Terima kasih telah menghubungi layanan bantuan Klinik Amanah. Permintaan Anda telah kami tindak lanjuti sesuai SOP.', $3, NOW());
      `,
      [ticketId, csStaff.userId, `${day.date} 11:30:00+07`]
    );
  }

  // 3. Seed Notifications across 3 months
  const notificationPresets = [
    {
      category: 'appointment',
      title: 'Pengingat Janji Temu Medis',
      body: 'Janji temu Anda di Poliklinik Umum telah terjadwal. Mohon hadir 15 menit sebelum waktu konsultasi.',
      audience: 'external',
    },
    {
      category: 'queue',
      title: 'Panggilan Nomor Antrean Anda',
      body: 'Nomor antrean Anda telah dipanggil. Silakan memasuki ruangan periksa poliklinik.',
      audience: 'external',
    },
    {
      category: 'clinical',
      title: 'Rekam Medis Siap Diakses',
      body: 'Catatan rekam medis dan resep obat dari kunjungan terakhir Anda sudah tersedia di aplikasi.',
      audience: 'external',
    },
    {
      category: 'shift',
      title: 'Pengumuman Jadwal Shift Staf',
      body: 'Jadwal dinas roster dan alokasi sesi poliklinik minggu ini telah diperbarui oleh Koordinator.',
      audience: 'internal',
    },
  ];

  for (let i = 0; i < 40; i++) {
    const np = notificationPresets[i % notificationPresets.length];
    const day = timeline[Math.floor((i / 40) * (timeline.length - 1))];
    const targetUser = np.audience === 'external'
      ? familyHeads[i % familyHeads.length].familyHeadUserId
      : staffList[i % staffList.length].userId;

    const notifTime = `${day.date} 08:30:00+07`;
    const notifRes = await client.query(
      `
      INSERT INTO notifications (
        category, title, sender_name, sender_role, body, is_urgent,
        metadata, audience, created_by, created_at, updated_at
      )
      VALUES ($1, $2, 'Klinik Pratama Amanah', 'system', $3, false, '{}'::jsonb, $4, $5, $6, NOW())
      RETURNING id;
      `,
      [
        np.category,
        np.title,
        np.body,
        np.audience,
        adminUser,
        notifTime,
      ]
    );
    const notifId = notifRes.rows[0].id;

    // Insert recipient
    await client.query(
      `
      INSERT INTO notification_recipients (
        notification_id, user_id, delivered_at, read_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT DO NOTHING;
      `,
      [
        notifId,
        targetUser,
        `${day.date} 08:30:05+07`,
        `${day.date} 08:45:00+07`,
        notifTime,
      ]
    );
  }
}
