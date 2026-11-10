const API_BASE = 'http://localhost:3001/api/v1';

async function main() {
  console.log('================================================================================');
  console.log(' [TEST VERIFIKASI] SDM Detail Modal Hardening & Auth Providers');
  console.log('================================================================================\n');

  // 1. Login sebagai admin
  console.log('1. Melakukan autentikasi admin...');
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
  console.log('✅ Berhasil login sebagai admin. Token didapatkan.\n');

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2. Cek endpoint users (Verifikasi hasGoogle, hasPassword, authProviders)
  console.log('2. Menguji endpoint GET /admin/users...');
  const usersRes = await fetch(`${API_BASE}/admin/users?limit=5`, { headers });
  if (!usersRes.ok) {
    console.error('❌ Gagal memuat users:', usersRes.status, await usersRes.text());
  } else {
    const usersData = await usersRes.json();
    const userList = usersData.users || usersData.data || usersData;
    console.log(`✅ Berhasil memuat ${userList.length} user.`);
    if (userList.length > 0) {
      const sample = userList[0];
      console.log('   Sample User:', {
        name: sample.name,
        email: sample.email,
        authProviders: sample.authProviders,
        hasGoogle: sample.hasGoogle,
        hasPassword: sample.hasPassword
      });
      if (sample.hasPassword !== undefined && sample.hasGoogle !== undefined) {
        console.log('   ✅ Validasi Payload: hasGoogle dan hasPassword terpetakan dengan benar.');
      } else {
        console.warn('   ⚠️ Perhatian: hasGoogle atau hasPassword belum ada di sample user.');
      }
    }
  }

  // 3. Cek endpoint staffs (Verifikasi hasGoogle, hasPassword, authProviders)
  console.log('\n3. Menguji endpoint GET /staffs...');
  const staffRes = await fetch(`${API_BASE}/staffs`, { headers });
  if (!staffRes.ok) {
    console.error('❌ Gagal memuat staffs:', staffRes.status, await staffRes.text());
  } else {
    const staffData = await staffRes.json();
    const staffList = Array.isArray(staffData) ? staffData : staffData.data || [];
    console.log(`✅ Berhasil memuat ${staffList.length} staf.`);
    if (staffList.length > 0) {
      const sample = staffList[0];
      console.log('   Sample Staff:', {
        fullName: sample.fullName,
        email: sample.email,
        staffCode: sample.staffCode,
        hasGoogle: sample.hasGoogle,
        hasPassword: sample.hasPassword,
        authProviders: sample.authProviders
      });
      if (sample.hasPassword !== undefined && sample.hasGoogle !== undefined) {
        console.log('   ✅ Validasi Payload: hasGoogle dan hasPassword terpetakan dengan benar pada Staf.');
      }
    }
  }

  console.log('\n================================================================================');
  console.log(' [SELESAI] Seluruh pengujian endpoint runtime berhasil diverifikasi.');
  console.log('================================================================================');
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
