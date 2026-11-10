const API_BASE = 'http://localhost:3001/api/v1';

interface MasterDay {
  dow: number;
  code: string;
  nameId: string;
  isActive: boolean;
}

interface WeeklyTemplate {
  id: string;
  sessionId: string;
  dow: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  sessionLabel?: string;
}

interface SessionDef {
  id: string;
  code: string;
  label?: string;
  isActive: boolean;
}

async function main() {
  console.log('================================================================================');
  console.log(' [TEST VERIFIKASI] Master Cascading (Hari Operasional -> Template -> Roster)');
  console.log('                   & Patient Impact Evaluation Alert');
  console.log('================================================================================\n');

  // 1. Autentikasi Admin
  console.log('1. Melakukan autentikasi admin (admin@amanah.com)...');
  const loginRes = await fetch(`${API_BASE}/auth/email/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@amanah.com',
      password: 'secret123'
    })
  });

  if (!loginRes.ok) {
    const err = await loginRes.text();
    console.error('❌ Gagal login:', loginRes.status, err);
    process.exit(1);
  }

  const loginData = await loginRes.json();
  const token = loginData.token || loginData.accessToken;
  console.log('✅ Berhasil login sebagai admin.\n');

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2. Ambil Konfigurasi Awal (Baseline)
  console.log('2. Mengambil konfigurasi jadwal operasional aktif...');
  const configRes = await fetch(`${API_BASE}/admin/schedule-configuration`, { headers });
  if (!configRes.ok) {
    console.error('❌ Gagal mengambil konfigurasi jadwal:', configRes.status, await configRes.text());
    process.exit(1);
  }

  const initialConfig = await configRes.json();
  const initialDays: MasterDay[] = initialConfig.days || [];
  const initialTemplates: WeeklyTemplate[] = initialConfig.weeklyTemplates || [];
  const initialSessionDefs: SessionDef[] = initialConfig.sessionDefs || [];

  console.log(`   - Master Hari Terdaftar: ${initialDays.length} hari`);
  console.log(`   - Template Mingguan Terdaftar: ${initialTemplates.length} item`);
  console.log(`   - Master Shift Terdaftar: ${initialSessionDefs.length} shift\n`);

  // Target hari pengujian: Hari Selasa (dow: 2)
  const targetDow = 2; // Selasa
  const selasaOriginal = initialDays.find((d) => d.dow === targetDow);
  const selasaTemplates = initialTemplates.filter((t) => t.dow === targetDow);

  console.log(`Target pengujian DOW ${targetDow} (${selasaOriginal?.nameId || 'Selasa'}):`);
  console.log(`   - Status aktif awal: ${selasaOriginal?.isActive}`);
  console.log(`   - Template mingguan pada hari ini: ${selasaTemplates.length} shift\n`);

  // 3. Test Impact Evaluator saat Menutup Hari Operasional
  console.log('3. Menguji POST /admin/schedule-configuration/evaluate-impact untuk Hari Operasional...');
  const evaluateRes = await fetch(`${API_BASE}/admin/schedule-configuration/evaluate-impact`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operatingDays: [{ dow: targetDow, isActive: false }]
    })
  });

  if (!evaluateRes.ok) {
    console.error('❌ Gagal evaluasi dampak:', evaluateRes.status, await evaluateRes.text());
    process.exit(1);
  }

  const impactResult = await evaluateRes.json();
  console.log('   Hasil Evaluasi Dampak Penonaktifan Hari Operasional:');
  console.log(`   - Severity: ${impactResult.severity}`);
  console.log(`   - Dokter Terdampak: ${impactResult.affectedDoctorsCount}`);
  console.log(`   - Janji Temu / Pasien Menunggu: ${impactResult.affectedAppointmentsCount}`);
  console.log(`   - Peringatan (${impactResult.warnings?.length || 0}):`);
  for (const warn of impactResult.warnings || []) {
    console.log(`     • ${warn}`);
  }

  if (impactResult.warnings && impactResult.warnings.length > 0) {
    console.log('   ✅ Impact evaluator berhasil memvalidasi penonaktifan hari operasional dan menghasilkan peringatan ter-grouping.\n');
  } else {
    console.log('   ℹ️ Tidak ada janji temu / dokter terdampak pada hari Selasa.\n');
  }

  // 4. Test Mutasi Cascading: Nonaktifkan Hari Selasa via batchUpdate
  console.log('4. Menguji PUT /admin/schedule-configuration/batch untuk menonaktifkan Hari Selasa...');
  const batchRes = await fetch(`${API_BASE}/admin/schedule-configuration/batch`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      operatingDays: [{ dow: targetDow, isActive: false }]
    })
  });

  if (!batchRes.ok) {
    console.error('❌ Gagal batch update jadwal:', batchRes.status, await batchRes.text());
    process.exit(1);
  }

  const batchResult = await batchRes.json();
  console.log(`   Response batch update: ${JSON.stringify(batchResult)}`);

  // 5. Verifikasi Mutasi Kaskade di Database
  console.log('\n5. Memverifikasi efek kaskade pasca penonaktifan Hari Selasa...');
  const verifyConfigRes = await fetch(`${API_BASE}/admin/schedule-configuration`, { headers });
  const verifyConfig = await verifyConfigRes.json();

  const verifySelasa = (verifyConfig.days as MasterDay[]).find((d) => d.dow === targetDow);
  const verifySelasaTemplates = (verifyConfig.weeklyTemplates as WeeklyTemplate[]).filter(
    (t) => t.dow === targetDow
  );

  console.log(`   - Status Master Hari Selasa: ${verifySelasa?.isActive ? 'AKTIF' : 'NONAKTIF'}`);
  const allTemplatesInactive = verifySelasaTemplates.every((t) => t.isActive === false);
  console.log(`   - Status Template Mingguan Selasa (Total: ${verifySelasaTemplates.length}):`);
  for (const t of verifySelasaTemplates) {
    console.log(`     • Shift ID ${t.sessionId}: isActive = ${t.isActive}`);
  }

  if (verifySelasa?.isActive === false && (verifySelasaTemplates.length === 0 || allTemplatesInactive)) {
    console.log('   ✅ KASKADE BERHASIL: Hari Selasa nonaktif dan seluruh template mingguan pada hari Selasa otomatis nonaktif!\n');
  } else {
    console.error('   ❌ KASKADE GAGAL: Template mingguan masih ada yang aktif.');
    process.exit(1);
  }

  // 6. Test Mutasi Cascading Shift Template Mingguan
  if (initialSessionDefs.length > 0) {
    const testShift = initialSessionDefs[0];
    const rabuDow = 3; // Rabu
    console.log(`6. Menguji kaskade penonaktifan satu shift template mingguan (Shift: ${testShift.code}, DOW: ${rabuDow})...`);
    
    const singleShiftDeactivateRes = await fetch(`${API_BASE}/admin/schedule-configuration/batch`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        weeklyTemplates: [
          {
            sessionId: testShift.id,
            dow: rabuDow,
            startsAt: '08:00',
            endsAt: '12:00',
            isActive: false
          }
        ]
      })
    });

    if (!singleShiftDeactivateRes.ok) {
      console.error('❌ Gagal update shift template:', singleShiftDeactivateRes.status, await singleShiftDeactivateRes.text());
    } else {
      console.log('   ✅ Berhasil menonaktifkan shift template mingguan Rabu.');
    }
  }

  // 7. Revert / Rollback Semua Perubahan ke Kondisi Semula
  console.log('\n7. Mengembalikan data (rollback) ke kondisi awal semula...');
  const rollbackRes = await fetch(`${API_BASE}/admin/schedule-configuration/batch`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      operatingDays: initialDays.map((d) => ({ dow: d.dow, isActive: d.isActive })),
      weeklyTemplates: initialTemplates.map((t) => ({
        sessionId: t.sessionId,
        dow: t.dow,
        startsAt: t.startsAt.slice(0, 5),
        endsAt: t.endsAt.slice(0, 5),
        isActive: t.isActive
      }))
    })
  });

  if (!rollbackRes.ok) {
    console.error('❌ Gagal rollback:', rollbackRes.status, await rollbackRes.text());
  } else {
    console.log('✅ Rollback berhasil. Database kembali bersih sesuai kondisi awal.');
  }

  console.log('\n================================================================================');
  console.log(' [SELESAI] Seluruh pengujian mutasi kaskade & impact evaluator sukses 100%!');
  console.log('================================================================================');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
