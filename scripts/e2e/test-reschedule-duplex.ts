import { io } from 'socket.io-client';

const API_BASE = 'http://localhost:3001';

async function postJson(url: string, body: any, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${url} failed [${res.status}]: ${text}`);
  }
  return await res.json();
}

async function getJson(url: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url} failed [${res.status}]: ${text}`);
  }
  return await res.json();
}

async function runE2ETest() {
  console.log('=== STARTING DUPLEX RESCHEDULE LIVE E2E TEST ===\n');

  // 1. Login Admin
  console.log('[1] Logging in as Admin...');
  const adminLogin = await postJson('/api/v1/auth/email/login', {
    email: 'admin@amanah.com',
    password: 'secret123',
  });
  const adminToken = adminLogin.token || adminLogin.session?.token;
  console.log('    Admin logged in successfully.\n');

  // 2. Login Patient
  console.log('[2] Logging in as Patient...');
  const patientLogin = await postJson('/api/v1/auth/email/login', {
    email: 'pasien@amanah.com',
    password: 'secret123',
  });
  const patientToken = patientLogin.token || patientLogin.session?.token;
  const patientId = 'ab115dbf-cb8e-4ac8-8764-2586b07ca367';
  console.log('    Patient logged in successfully.\n');

  // 3. Connect Admin to WebSocket
  console.log('[3] Connecting Admin WebSocket client to /realtime...');
  const adminSocket = io(`${API_BASE}/realtime`, {
    auth: { token: adminToken },
    transports: ['websocket'],
  });

  const receivedNotifications: any[] = [];
  adminSocket.on('notification:new', (notif) => {
    const receivedAt = Date.now();
    console.log(`\n    [WS] Admin received notification:new -> "${notif.title}" at ${new Date(receivedAt).toISOString()}`);
    receivedNotifications.push({ notif, receivedAt });
  });

  await new Promise<void>((resolve, reject) => {
    adminSocket.on('connect', () => {
      console.log('    Admin socket connected! Socket ID:', adminSocket.id);
      resolve();
    });
    adminSocket.on('connect_error', (err) => {
      console.error('    Socket connect error:', err.message);
      reject(err);
    });
  });

  // 4. Patient creates Morning appointment with Dr. Ahmad Santoso
  console.log('\n[4] Patient booking Morning appointment with dr. Ahmad Santoso...');
  const targetDate = '2026-10-01';
  const poliUmumId = '53fa8088-46c8-4611-9dea-99a54f4a45ab';
  const layananUmumId = '59c6b882-5a93-487d-945d-fd08d2a7bb82';
  const drAhmadId = '77bbb45a-18df-4311-b2a4-a4b6f22870ca';

  const appointment = await postJson(
    '/api/v1/appointments',
    {
      patientId,
      poliklinikId: poliUmumId,
      layananId: layananUmumId,
      staffId: drAhmadId,
      appointmentDate: targetDate,
      session: 'PAGI',
      visitType: 'Pemeriksaan Baru',
      complaint: 'Pemeriksaan tensi darah rutin',
    },
    patientToken,
  );
  console.log(`    Appointment created: ID = ${appointment.id}`);
  console.log(`    Original Doctor = ${appointment.doctorName} (staffId: ${appointment.staffId})`);
  console.log(`    Original Time   = ${appointment.scheduledStartTime} - ${appointment.scheduledEndTime}`);
  console.log(`    Original Queue  = ${appointment.queueNumber}`);

  // Wait for creation notification
  await new Promise((r) => setTimeout(r, 1000));

  // 5. Patient reschedules to target Night session
  const nightSessionId = '4e7e576d-8a2a-4076-85ec-70da3de2db26'; // mobile test, Night session
  console.log(`\n[5] Patient rescheduling appointment to Night session ID: ${nightSessionId}...`);
  const rescheduleStartTime = Date.now();

  const rescheduled = await postJson(
    `/api/v1/appointments/${appointment.id}/reschedule`,
    {
      target_date: targetDate,
      target_session_id: nightSessionId,
      reason: 'Ada urusan penting pagi hari, pindah ke malam',
    },
    patientToken,
  );

  console.log('    Reschedule API succeeded!');
  console.log(`    New Doctor Scheduled : ${rescheduled.doctorName} (practitioner: ${rescheduled.staffId})`);
  console.log(`    New Scheduled Time   : ${rescheduled.scheduledStartTime} - ${rescheduled.scheduledEndTime}`);

  // 6. Verify real-time notification received by Admin
  console.log('\n[6] Waiting for Admin WebSocket notification...');
  let rescheduleNotif: any = null;
  const timeoutMs = 5000;
  const pollStart = Date.now();

  while (Date.now() - pollStart < timeoutMs) {
    rescheduleNotif = receivedNotifications.find(
      (n) =>
        n.notif.title.includes('Perubahan Jadwal') ||
        n.notif.body.includes('memindahkan jadwal') ||
        n.notif.sourceId === appointment.id,
    );
    if (rescheduleNotif) break;
    await new Promise((r) => setTimeout(r, 50));
  }

  if (!rescheduleNotif) {
    adminSocket.disconnect();
    throw new Error('FAIL: Admin did not receive real-time notification within 5 seconds!');
  }

  const latency = rescheduleNotif.receivedAt - rescheduleStartTime;
  console.log('    SUCCESS! Real-time notification received by Admin:');
  console.log(`    - Title   : "${rescheduleNotif.notif.title}"`);
  console.log(`    - Body    : "${rescheduleNotif.notif.body}"`);
  console.log(`    - Sender  : ${rescheduleNotif.notif.senderName} (${rescheduleNotif.notif.senderRole})`);
  console.log(`    - Latency : ${latency}ms`);

  // 7. Verify Canonical DB State
  console.log('\n[7] Verifying canonical DB state...');
  const latestApt = await getJson(`/api/v1/appointments/${appointment.id}`, adminToken);
  console.log(`    DB appointment ID          : ${latestApt.id}`);
  console.log(`    DB practitionerId (staffId): ${latestApt.staffId}`);
  console.log(`    DB doctorName              : ${latestApt.doctorName}`);
  console.log(`    DB scheduledStartTime      : ${latestApt.scheduledStartTime}`);
  console.log(`    DB scheduledEndTime        : ${latestApt.scheduledEndTime}`);

  if (latestApt.staffId === drAhmadId) {
    adminSocket.disconnect();
    throw new Error('FAIL: practitionerId was NOT updated to target session doctor! Ghost appointment bug still exists!');
  }

  console.log('    CONFIRMED: practitionerId updated to new session doctor (No ghost appointment!)');

  adminSocket.disconnect();
  console.log('\n=== DUPLEX RESCHEDULE LIVE E2E TEST PASSED! ===');
  process.exit(0);
}

runE2ETest().catch((err) => {
  console.error('\nE2E Test Failed:', err);
  process.exit(1);
});
