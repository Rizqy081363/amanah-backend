import fs from 'node:fs';
import path from 'node:path';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api/v1';
const OUTPUT_FILE = path.resolve(process.cwd(), 'docs/SCHEDULE_MANAGEMENT_API_SPEC.md');

interface EndpointDoc {
  section: string;
  title: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  role: string;
  purpose: string;
  clientUsage: string;
  requestHeaders?: Record<string, string>;
  requestParams?: Record<string, string>;
  requestBody?: any;
  responseStatus: number;
  responseBody: any;
  notes?: string;
}

const docs: EndpointDoc[] = [];

async function jsonRequest(
  method: string,
  endpointPath: string,
  token?: string,
  body?: any,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${endpointPath}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data: any;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return { status: res.status, data };
  } catch (err: any) {
    return {
      status: 500,
      data: { error: err.message || 'Connection failed' },
    };
  }
}

async function run() {
  console.log('==========================================================');
  console.log('   AMANAH HEALTHCARE - SCHEDULES DOCS & TEST GENERATOR   ');
  console.log('==========================================================');
  console.log(`Target URL: ${API_BASE_URL}`);

  // 1. Authenticate Doctor & Admin
  console.log('\n[1/7] Authenticating Doctor & Admin...');
  const doctorAuth = await jsonRequest('POST', '/auth/email/login', undefined, {
    email: 'zikriahmadamikom@gmail.com',
    password: 'secret123',
  });
  const doctorToken = doctorAuth.data.token;
  const doctorUser = doctorAuth.data.user;
  const practitionerId = doctorUser.staff?.practitionerId || 'c518facb-372e-4f07-9766-f3eacf54221f';

  const adminAuth = await jsonRequest('POST', '/auth/email/login', undefined, {
    email: 'admin@amanah.com',
    password: 'secret123',
  });
  const adminToken = adminAuth.data.token;

  console.log(`Doctor Authenticated: ${doctorUser.name} (${practitionerId})`);
  console.log(`Admin Authenticated: ${adminAuth.data.user?.name}`);

  // Discover active schedule sessions & data
  const mySchedRes = await jsonRequest('GET', '/schedules/my-schedules', doctorToken);
  const morningSession = (mySchedRes.data || []).find((s: any) => s.sessionShift === 'morning' || s.session === 'PAGI');
  const morningSessionId = morningSession?.id || '936833d1-8c2d-4f27-89bd-5f811e833859';
  const poliklinikId = morningSession?.poliklinikId || '53fa8088-46c8-4611-9dea-99a54f4a45ab';
  const defaultRoomId = morningSession?.roomId || 'b77d141b-2fa5-4481-9f47-a5a040faf57a';
  const serviceId = morningSession?.serviceId || '59c6b882-5a93-487d-945d-fd08d2a7bb82';
  const scheduleDate = morningSession?.scheduleDate || '2026-09-25';

  // Discover active booked appointments for this session
  const sessionPatientsRes = await jsonRequest('GET', `/schedules/sessions/${morningSessionId}/patients`, doctorToken);
  const sampleAppointment = sessionPatientsRes.data?.data?.[0] || sessionPatientsRes.data?.[0];
  const sampleAppointmentId = sampleAppointment?.appointmentId || '0662657e-61fb-429f-a968-3e4b37f40776';

  // SECTION 1: Master Options & Reference Data
  console.log('\n[2/7] Capturing Master Options & Reference Data...');

  const optRes = await jsonRequest('GET', '/schedules/reference/options', doctorToken);
  docs.push({
    section: '1. Master Options & Reference Data',
    title: 'Master Opsi Konfigurasi Jadwal (Shifts, Status, Intervals)',
    method: 'GET',
    endpoint: '/api/v1/schedules/reference/options',
    role: 'ADMIN, STAF, PATIENT (Bearer Token)',
    purpose: 'Menyediakan referensi resmi shift 24 jam (Dini Hari, Pagi, Siang, Malam), status kanonikal jadwal (OPEN, CLOSED, FULL, LEAVE), dan durasi interval konsultasi.',
    clientUsage: 'Gunakan endpoint ini untuk mengisi dropdown filter status, selector shift praktik, dan opsi durasi konsultasi di mobile app dan web admin.',
    responseStatus: optRes.status,
    responseBody: optRes.data,
  });

  const roomsRes = await jsonRequest('GET', `/schedules/reference/rooms?date=${scheduleDate}&startTime=06:00&endTime=12:00`, doctorToken);
  docs.push({
    section: '1. Master Options & Reference Data',
    title: 'Daftar Ruang Praktik Klinik & Status Okupansi Real-time',
    method: 'GET',
    endpoint: `/api/v1/schedules/reference/rooms?date=${scheduleDate}&startTime=06:00&endTime=12:00`,
    role: 'ADMIN, STAF, PATIENT (Bearer Token)',
    purpose: 'Menampilkan seluruh ruangan periksa klinik aktif beserta deteksi otomatis apakah ruangan sedang ditempati dokter lain pada rentang jam yang dipilih.',
    clientUsage: 'Render ruangan sebagai selector pilihan ruang periksa. Jika isOccupied === true, kunci atau beri label merah (Ruang sudah terpakai oleh dr. X).',
    requestParams: { date: scheduleDate, startTime: '06:00', endTime: '12:00' },
    responseStatus: roomsRes.status,
    responseBody: roomsRes.data,
  });

  const poliRes = await jsonRequest('GET', '/schedules/reference/polikliniks', doctorToken);
  docs.push({
    section: '1. Master Options & Reference Data',
    title: 'Master Unit Poliklinik Aktif',
    method: 'GET',
    endpoint: '/api/v1/schedules/reference/polikliniks',
    role: 'ADMIN, STAF, PATIENT (Bearer Token)',
    purpose: 'Menampilkan daftar unit poliklinik klinik yang aktif (Poli Umum, Poli KIA, Gigi, dll.).',
    clientUsage: 'Dropdown unit poli saat dokter/staf menyaring jadwal atau membuat jadwal praktik baru.',
    responseStatus: poliRes.status,
    responseBody: poliRes.data,
  });

  const adminFilterOptRes = await jsonRequest('GET', '/admin/doctor-schedules/filter-options', adminToken);
  docs.push({
    section: '1. Master Options & Reference Data',
    title: 'Master Opsi Filter Supervisi Admin (Poli, Spesialisasi, Status)',
    method: 'GET',
    endpoint: '/api/v1/admin/doctor-schedules/filter-options',
    role: 'ADMIN, STAF (Bearer Token)',
    purpose: 'Menyediakan referensi spesialisasi medis, unit poliklinik, dan pilihan status jadwal untuk dropdown toolbar pencarian dashboard admin.',
    clientUsage: 'Inisialisasi form search and filter di halaman manajemen supervisi jadwal web admin.',
    responseStatus: adminFilterOptRes.status,
    responseBody: adminFilterOptRes.data,
  });

  const clinicalPractitionersRes = await jsonRequest('GET', `/clinical/practitioners?date=${scheduleDate}`, undefined);
  docs.push({
    section: '1. Master Options & Reference Data',
    title: 'Daftar Dokter & Ketersediaan Praktik Pasien (Public Booking)',
    method: 'GET',
    endpoint: `/api/v1/clinical/practitioners?date=${scheduleDate}`,
    role: 'PUBLIC (Tanpa Autentikasi)',
    purpose: 'Digunakan oleh aplikasi pasien (Amanah Patient App) untuk melihat daftar dokter yang berpraktik pada tanggal tertentu beserta spesialisasi dan status ketersediaan slotnya.',
    clientUsage: 'Katalog dokter pada fitur reservasi janji temu pasien.',
    requestParams: { date: scheduleDate },
    responseStatus: clinicalPractitionersRes.status,
    responseBody: clinicalPractitionersRes.data,
  });

  const poliScheduleRes = await jsonRequest('GET', `/schedules/poli/${poliklinikId}?date=${scheduleDate}`, doctorToken);
  docs.push({
    section: '1. Master Options & Reference Data',
    title: 'Jadwal Dokter Aktif Berdasarkan Poliklinik',
    method: 'GET',
    endpoint: `/api/v1/schedules/poli/${poliklinikId}?date=${scheduleDate}`,
    role: 'ADMIN, STAF, PATIENT (Bearer Token)',
    purpose: 'Mengambil jadwal dokter yang bertugas di unit poliklinik tertentu pada tanggal spesifik.',
    clientUsage: 'Menampilkan jadwal dokter jaga ketika pasien memilih poliklinik spesifik.',
    responseStatus: poliScheduleRes.status,
    responseBody: poliScheduleRes.data,
  });

  // SECTION 2: Schedule Contexts & Dynamic Slot Projection
  console.log('\n[3/7] Capturing Contexts, Dynamic Slot Math & Projection...');

  const bootstrapRes = await jsonRequest('GET', `/schedules/form-bootstrap?date=${scheduleDate}`, doctorToken);
  docs.push({
    section: '2. Context, Dynamic Slot Math & Projection',
    title: 'Inisialisasi Form Jadwal Dokter 1-Roundtrip (Form Bootstrap)',
    method: 'GET',
    endpoint: `/api/v1/schedules/form-bootstrap?date=${scheduleDate}`,
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Menggantikan 4 pemanggilan HTTP terpisah (/options, /rooms, /polikliniks, /contexts) menjadi 1 roundtrip terpadu saat membuka form Tambah/Edit Jadwal. Menyediakan profil dokter (defaultRoomId, defaultPoliklinikId, consultationDurationMinutes), seluruh ruangan aktif beserta status okupansinya untuk tanggal target, daftar poliklinik aktif, dan 4 shift kanonikal 24 jam beserta jadwal dokter yang telah ada.',
    clientUsage: 'Dipanggil saat drawer/modal Tambah atau Edit Jadwal dibuka. Frontend menginisialisasi form secara instan dengan defaultRoomId dan defaultPoliklinikId tanpa fallback buta ke ruangan pertama.',
    requestParams: { date: scheduleDate },
    responseStatus: bootstrapRes.status,
    responseBody: bootstrapRes.data,
  });

  const slotAvailRes = await jsonRequest(
    'GET',
    `/schedules/slot-availability?date=${scheduleDate}&shift=morning&roomId=${defaultRoomId}`,
    doctorToken,
  );
  docs.push({
    section: '2. Context, Dynamic Slot Math & Projection',
    title: 'SSOT Anti-Collision Slot Grid & Ketersediaan Slot Otomatis (Slot Availability)',
    method: 'GET',
    endpoint: `/api/v1/schedules/slot-availability?date=${scheduleDate}&shift=morning&roomId=${defaultRoomId}`,
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Menghitung matriks ketersediaan slot 30 menit (12 slot per shift 6 jam) secara 100% di backend. Menghilangkan seluruh kalkulasi bentrok di frontend dengan sistem resolusi prioritas: TEMPORAL_PAST (Sudah Selesai), CLOSED_LEAVE (Cuti), PRACTITIONER_OVERLAP (Jadwal Anda), ROOM_OCCUPIED (Nama Dokter Lain), dan AVAILABLE (Tersedia).',
    clientUsage: 'Dipanggil saat tanggal, shift, atau ruangan dipilih pada form. Frontend murni merender array slot sesuai flag isAvailable dan displayLabel tanpa kalkulasi matematika atau logika bentrok lokal.',
    requestParams: { date: scheduleDate, shift: 'morning', roomId: defaultRoomId },
    responseStatus: slotAvailRes.status,
    responseBody: slotAvailRes.data,
  });

  const contextRes = await jsonRequest('GET', `/schedules/contexts?date=${scheduleDate}`, doctorToken);
  docs.push({
    section: '2. Context, Dynamic Slot Math & Projection',
    title: 'Konteks Siklus 4 Shift & Durasi Efektif Dokter',
    method: 'GET',
    endpoint: `/api/v1/schedules/contexts?date=${scheduleDate}`,
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Mengembalikan 4 shift siklus 24 jam (Dini Hari 00:00-06:00, Pagi 06:00-12:00, Siang 12:00-18:00, Malam 18:00-24:00) beserta durasi konsultasi efektif dokter dari database (misal 30 menit).',
    clientUsage: 'Menjadi acuan dasar frontend untuk membagi shift kalender dan step durasi slot tanpa hardcode.',
    requestParams: { date: scheduleDate },
    responseStatus: contextRes.status,
    responseBody: contextRes.data,
  });

  const projRes = await jsonRequest(
    'GET',
    `/schedules/projection?date=${scheduleDate}&startTime=08:00&contextType=morning`,
    doctorToken,
  );
  docs.push({
    section: '2. Context, Dynamic Slot Math & Projection',
    title: 'Preview Proyeksi Slot Dinamis Berbasis Jam Mulai Arbitrer',
    method: 'GET',
    endpoint: `/api/v1/schedules/projection?date=${scheduleDate}&startTime=08:00&contextType=morning`,
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Menerima tanggal, jam mulai (misal 08:00), dan shift. Backend memproyeksikan seluruh interval 30 menit hingga batas shift tanpa membulatkan jam mulai.',
    clientUsage: 'Live preview slot saat dokter atau admin menggeser time-picker jam mulai praktik.',
    requestParams: { date: scheduleDate, startTime: '08:00', contextType: 'morning' },
    responseStatus: projRes.status,
    responseBody: projRes.data,
  });

  const occRes = await jsonRequest('GET', `/schedules/occupancy-overview?date=${scheduleDate}`, doctorToken);
  docs.push({
    section: '2. Context, Dynamic Slot Math & Projection',
    title: 'Anti-Collision Grid: Okupansi Slot Lintas 4 Shift',
    method: 'GET',
    endpoint: `/api/v1/schedules/occupancy-overview?date=${scheduleDate}`,
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Menampilkan matriks 4 shift lengkap dengan status keterisian setiap slot (Buka, Terisi, Tutup) untuk mencegah tabrakan jadwal atau ruangan sebelum submit.',
    clientUsage: 'Visual timeline grid 24 jam pada dashboard dokter / admin.',
    requestParams: { date: scheduleDate },
    responseStatus: occRes.status,
    responseBody: occRes.data,
  });

  // SECTION 3: Doctor Schedule CRUD & Calendar View (Mobile & Web)
  console.log('\n[4/7] Capturing Doctor Schedule CRUD & Calendar Views...');

  const mySchedDocRes = await jsonRequest('GET', `/schedules/my-schedules?date=${scheduleDate}`, doctorToken);
  docs.push({
    section: '3. Doctor Schedule CRUD & Calendar View (Mobile & Web)',
    title: 'Melihat Jadwal Praktik Dokter yang Sedang Login',
    method: 'GET',
    endpoint: `/api/v1/schedules/my-schedules?date=${scheduleDate}`,
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Endpoint utama Mobile App dokter. Menampilkan seluruh sesi dinas dokter login lengkap dengan kapasitas dinamis, slot tersedia, jumlah pasien booked, dan flag kelayakan reschedule.',
    clientUsage: 'Home screen / agenda tab aplikasi mobile dokter.',
    requestParams: { date: scheduleDate },
    responseStatus: mySchedDocRes.status,
    responseBody: mySchedDocRes.data,
  });

  const calSumRes = await jsonRequest('GET', '/schedules/calendar-summary?month=2026-09', doctorToken);
  docs.push({
    section: '3. Doctor Schedule CRUD & Calendar View (Mobile & Web)',
    title: 'Ringkasan Kalender Bulanan Dokter (Monthly Dot Markers)',
    method: 'GET',
    endpoint: '/api/v1/schedules/calendar-summary?month=2026-09',
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Mengembalikan rekap per tanggal dalam 1 bulan kalender: status buka/tutup, status cuti dokter, total kuota, dan akumulasi pasien.',
    clientUsage: 'Komponen kalender bulanan mobile app untuk menampilkan badge titik (dots) status dinas/cuti/penuh di setiap tanggal.',
    requestParams: { month: '2026-09' },
    responseStatus: calSumRes.status,
    responseBody: calSumRes.data,
  });

  const daySettingGetRes = await jsonRequest('GET', `/schedules/day-settings?date=${scheduleDate}`, doctorToken);
  docs.push({
    section: '3. Doctor Schedule CRUD & Calendar View (Mobile & Web)',
    title: 'Pengaturan Target Kuota & Cuti Harian Dokter (Get)',
    method: 'GET',
    endpoint: `/api/v1/schedules/day-settings?date=${scheduleDate}`,
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Melihat konfigurasi kuota target harian dan status cuti dokter pada tanggal tertentu.',
    clientUsage: 'Modal setting hari praktik di mobile app dokter.',
    requestParams: { date: scheduleDate },
    responseStatus: daySettingGetRes.status,
    responseBody: daySettingGetRes.data,
  });

  const daySettingPutRes = await jsonRequest('PUT', '/schedules/day-settings', doctorToken, {
    date: '2026-10-15',
    targetQuota: 15,
    isCuti: false,
    cutiReason: null,
  });
  docs.push({
    section: '3. Doctor Schedule CRUD & Calendar View (Mobile & Web)',
    title: 'Simpan / Perbarui Pengaturan Kuota & Cuti Harian Dokter (Upsert)',
    method: 'PUT',
    endpoint: '/api/v1/schedules/day-settings',
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Dokter menetapkan target kuota pasien hariannya sendiri atau mengajukan status cuti pada tanggal tertentu.',
    clientUsage: 'Tombol simpan pada modal pengaturan harian mobile app.',
    requestBody: {
      date: '2026-10-15',
      targetQuota: 15,
      isCuti: false,
      cutiReason: null,
    },
    responseStatus: daySettingPutRes.status,
    responseBody: daySettingPutRes.data,
  });

  const toggleDayRes = await jsonRequest('PATCH', '/schedules/days/2026-10-15', doctorToken, {
    status: 'CLOSED',
    notes: 'Klinik tutup untuk pelatihan internal staf medis',
  });
  docs.push({
    section: '3. Doctor Schedule CRUD & Calendar View (Mobile & Web)',
    title: 'Tutup / Buka Seluruh Jadwal pada Hari Tertentu (Cascading Toggle)',
    method: 'PATCH',
    endpoint: '/api/v1/schedules/days/2026-10-15',
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Menonaktifkan (CLOSED) atau mengaktifkan kembali (OPEN) seluruh sesi praktik dokter pada tanggal kalender tertentu secara cascading.',
    clientUsage: 'Switch toggle Buka/Tutup Praktik Hari Ini di mobile app.',
    requestBody: {
      status: 'CLOSED',
      notes: 'Klinik tutup untuk pelatihan internal staf medis',
    },
    responseStatus: toggleDayRes.status,
    responseBody: toggleDayRes.data,
  });

  // Re-open day to keep state clean
  await jsonRequest('PATCH', '/schedules/days/2026-10-15', doctorToken, {
    status: 'OPEN',
    notes: null,
  });

  const createAvailRes = await jsonRequest('POST', '/schedules/availability', doctorToken, {
    date: '2026-10-20',
    scheduleContextId: 'morning',
    startTime: '08:00',
    roomId: defaultRoomId,
    poliklinikId,
  });
  docs.push({
    section: '3. Doctor Schedule CRUD & Calendar View (Mobile & Web)',
    title: 'Buat Sesi Jadwal Otomatis (Tanpa Input Jam Selesai Manual)',
    method: 'POST',
    endpoint: '/api/v1/schedules/availability',
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Menerima tanggal, shift, dan jam mulai. Backend otomatis menghitung jam selesai, kapasitas slot dinamis, dan mencegah bentrok ruangan.',
    clientUsage: 'Form Cepat Tambah Jadwal di aplikasi dokter: dokter cukup pilih jam mulai dan ruangan, backend yang mengurus hitungan durasinya.',
    requestBody: {
      date: '2026-10-20',
      scheduleContextId: 'morning',
      startTime: '08:00',
      roomId: defaultRoomId,
      poliklinikId,
    },
    responseStatus: createAvailRes.status,
    responseBody: createAvailRes.data,
  });

  // Query schedules paginated
  const listSchedRes = await jsonRequest('GET', `/schedules?page=1&limit=5&poliklinikId=${poliklinikId}`, doctorToken);
  docs.push({
    section: '3. Doctor Schedule CRUD & Calendar View (Mobile & Web)',
    title: 'Daftar Jadwal Seluruh Poliklinik dengan Pagination & Filter',
    method: 'GET',
    endpoint: `/api/v1/schedules?page=1&limit=5&poliklinikId=${poliklinikId}`,
    role: 'ADMIN, STAF, PATIENT (Bearer Token)',
    purpose: 'Mengambil jadwal praktik klinik terpaginasi dengan filter poliklinik, dokter, atau tanggal.',
    clientUsage: 'Tabel jadwal poliklinik di web dashboard atau pencarian jadwal di aplikasi pasien.',
    requestParams: { page: '1', limit: '5', poliklinikId },
    responseStatus: listSchedRes.status,
    responseBody: listSchedRes.data,
  });

  // Schedule detail by ID
  const schedDetailRes = await jsonRequest('GET', `/schedules/${morningSessionId}`, doctorToken);
  docs.push({
    section: '3. Doctor Schedule CRUD & Calendar View (Mobile & Web)',
    title: 'Detail Sesi Jadwal Praktik Berdasarkan ID',
    method: 'GET',
    endpoint: `/api/v1/schedules/${morningSessionId}`,
    role: 'ADMIN, STAF, PATIENT (Bearer Token)',
    purpose: 'Mengambil informasi lengkap satu sesi jadwal dokter.',
    clientUsage: 'Halaman rincian sesi jadwal di mobile app.',
    responseStatus: schedDetailRes.status,
    responseBody: schedDetailRes.data,
  });

  // Toggle availability
  const toggleAvailRes = await jsonRequest('PATCH', `/schedules/${morningSessionId}/availability`, doctorToken, {
    isAvailable: true,
  });
  docs.push({
    section: '3. Doctor Schedule CRUD & Calendar View (Mobile & Web)',
    title: 'Toggle Ketersediaan Penerimaan Pasien pada Sesi',
    method: 'PATCH',
    endpoint: `/api/v1/schedules/${morningSessionId}/availability`,
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Mengaktifkan atau menonaktifkan penerimaan antrean pasien baru pada sesi jadwal terkait secara instan.',
    clientUsage: 'Switch toggle "Terima Pendaftaran Pasien" di mobile app.',
    requestBody: { isAvailable: true },
    responseStatus: toggleAvailRes.status,
    responseBody: toggleAvailRes.data,
  });

  // Standard Create, Update, Delete test
  const tempSchedCreate = await jsonRequest('POST', '/schedules', doctorToken, {
    poliklinikId,
    serviceId,
    roomId: defaultRoomId,
    date: '2026-10-22',
    session: 'PAGI',
    sessionType: 'Pagi',
    startTime: '07:00',
    endTime: '09:00',
    capacity: 4,
    notes: 'Jadwal sementara uji otomasi',
  });
  const tempSchedId = tempSchedCreate.data?.id;

  docs.push({
    section: '3. Doctor Schedule CRUD & Calendar View (Mobile & Web)',
    title: 'Buat Jadwal Praktik Standar (Custom Time & Capacity)',
    method: 'POST',
    endpoint: '/api/v1/schedules',
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Membuat jadwal praktik custom dengan menentukan jam mulai, jam selesai, dan kapasitas secara spesifik.',
    clientUsage: 'Form custom jadwal di web admin atau mobile dokter.',
    requestBody: {
      poliklinikId,
      serviceId,
      roomId: defaultRoomId,
      date: '2026-10-22',
      session: 'PAGI',
      startTime: '07:00',
      endTime: '09:00',
      capacity: 4,
      notes: 'Jadwal sementara uji otomasi',
    },
    responseStatus: tempSchedCreate.status,
    responseBody: tempSchedCreate.data,
  });

  if (tempSchedId) {
    const tempSchedUpdate = await jsonRequest('PATCH', `/schedules/${tempSchedId}`, doctorToken, {
      startTime: '07:30',
      endTime: '09:30',
      capacity: 4,
      notes: 'Jadwal diperbarui via otomasi',
    });
    docs.push({
      section: '3. Doctor Schedule CRUD & Calendar View (Mobile & Web)',
      title: 'Update Informasi Sesi Jadwal Praktik',
      method: 'PATCH',
      endpoint: `/api/v1/schedules/${tempSchedId}`,
      role: 'STAF, ADMIN (Bearer Token)',
      purpose: 'Mengubah jam mulai, jam selesai, kuota kapasitas, atau catatan jadwal praktik.',
      clientUsage: 'Form edit sesi jadwal di mobile app.',
      requestBody: {
        startTime: '07:30',
        endTime: '09:30',
        capacity: 4,
        notes: 'Jadwal diperbarui via otomasi',
      },
      responseStatus: tempSchedUpdate.status,
      responseBody: tempSchedUpdate.data,
    });

    const tempSchedDelete = await jsonRequest('DELETE', `/schedules/${tempSchedId}`, doctorToken);
    docs.push({
      section: '3. Doctor Schedule CRUD & Calendar View (Mobile & Web)',
      title: 'Hapus Sesi Jadwal Praktik Bebas Pasien',
      method: 'DELETE',
      endpoint: `/api/v1/schedules/${tempSchedId}`,
      role: 'STAF, ADMIN (Bearer Token)',
      purpose: 'Menghapus sesi jadwal yang belum memiliki pasien terdaftar. Jadwal yang memiliki pasien aktif dilindungi dan ditolak.',
      clientUsage: 'Tombol hapus jadwal di mobile app.',
      responseStatus: tempSchedDelete.status,
      responseBody: { message: 'Schedule deleted successfully (HTTP 204 No Content)' },
    });
  }

  // SECTION 4: Interactive Patient Flow When Clicking a Schedule
  console.log('\n[5/7] Capturing Interactive Patient Flow When Clicking Schedule...');

  const sessionPatientsDoc = await jsonRequest('GET', `/schedules/sessions/${morningSessionId}/patients`, doctorToken);
  docs.push({
    section: '4. Interactive Patient Flow When Clicking a Schedule',
    title: 'Daftar Lengkap Pasien Sesi Terpilih (5 Kolom Demografis & Antrean)',
    method: 'GET',
    endpoint: `/api/v1/schedules/sessions/${morningSessionId}/patients`,
    role: 'STAF, ADMIN (Bearer Token) - CANONICAL MOBILE & ADMIN ROUTE',
    purpose: 'Dipanggil saat dokter mengklik kartu sesi jadwal di Mobile App. Mengembalikan daftar seluruh pasien terdaftar lengkap dengan 5 kolom demografis: Nama, NIK 16 digit, No. Rekam Medis (RM), Nomor Antrean, Jam Slot Konsultasi, Keluhan Klinis, Kontak Darurat / Wali, dan Status Kunjungan.',
    clientUsage: 'Tampilkan dalam bentuk Drawer/Modal/Bottom Sheet "Daftar Pasien Sesi Ini" dengan tombol aksi klinis di setiap baris pasien (Panggil, Periksa, Selesai).',
    responseStatus: sessionPatientsDoc.status,
    responseBody: sessionPatientsDoc.data,
  });

  const bookedPatientsByDateRes = await jsonRequest('GET', `/schedules/booked-patients?date=${scheduleDate}`, doctorToken);
  docs.push({
    section: '4. Interactive Patient Flow When Clicking a Schedule',
    title: 'Daftar Pasien Terdaftar Dokter Berdasarkan Tanggal Praktik',
    method: 'GET',
    endpoint: `/api/v1/schedules/booked-patients?date=${scheduleDate}`,
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Mengambil seluruh pasien yang mendaftar ke dokter login pada tanggal tertentu (akumulasi semua sesi).',
    clientUsage: 'Tab "Pasien Hari Ini" di mobile app dokter.',
    requestParams: { date: scheduleDate },
    responseStatus: bookedPatientsByDateRes.status,
    responseBody: bookedPatientsByDateRes.data,
  });

  const sessionBookedPatientsRes = await jsonRequest('GET', `/schedules/${morningSessionId}/booked-patients`, doctorToken);
  docs.push({
    section: '4. Interactive Patient Flow When Clicking a Schedule',
    title: 'Daftar Pasien Booking Berdasarkan ID Jadwal Spesifik',
    method: 'GET',
    endpoint: `/api/v1/schedules/${morningSessionId}/booked-patients`,
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Mengambil pasien yang memesan janji temu pada sesi spesifik.',
    clientUsage: 'Sub-list pasien per kartu jadwal.',
    responseStatus: sessionBookedPatientsRes.status,
    responseBody: sessionBookedPatientsRes.data,
  });

  const adminSessionPatientsRes = await jsonRequest(
    'GET',
    `/admin/doctor-schedules/${practitionerId}/sessions/${morningSessionId}/patients`,
    adminToken,
  );
  docs.push({
    section: '4. Interactive Patient Flow When Clicking a Schedule',
    title: 'Daftar Pasien Sesi Dokter (Supervisi Web Admin & Paritas Staf)',
    method: 'GET',
    endpoint: `/api/v1/admin/doctor-schedules/${practitionerId}/sessions/${morningSessionId}/patients`,
    role: 'ADMIN, STAF (Bearer Token)',
    purpose: 'Rute admin untuk menampilkan data pasien sesi dokter lengkap dengan 5 kolom demografis.',
    clientUsage: 'Modal tabel pasien supervisi di dashboard web admin.',
    responseStatus: adminSessionPatientsRes.status,
    responseBody: adminSessionPatientsRes.data,
  });

  const adminAccumulatedPatientsRes = await jsonRequest(
    'GET',
    `/admin/doctor-schedules/${practitionerId}/patients?date=${scheduleDate}`,
    adminToken,
  );
  docs.push({
    section: '4. Interactive Patient Flow When Clicking a Schedule',
    title: 'Akumulasi Seluruh Pasien Dokter 4 Sesi Harian (Admin)',
    method: 'GET',
    endpoint: `/api/v1/admin/doctor-schedules/${practitionerId}/patients?date=${scheduleDate}`,
    role: 'ADMIN, STAF (Bearer Token)',
    purpose: 'Menampilkan rekap total kapasitas, slot terisi, sisa slot, dan daftar pasien per sesi sepanjang 4 shift harian.',
    clientUsage: 'Halaman audit harian pasien dokter di web admin.',
    requestParams: { date: scheduleDate },
    responseStatus: adminAccumulatedPatientsRes.status,
    responseBody: adminAccumulatedPatientsRes.data,
  });

  // SECTION 5: Patient Actions Available From Schedule Patient List
  console.log('\n[6/7] Capturing Patient Actions Execution...');

  // Queue monitoring
  const queueDailyRes = await jsonRequest('GET', `/appointments/queue/daily?poliklinikId=${poliklinikId}&date=${scheduleDate}`, doctorToken);
  docs.push({
    section: '5. Patient Actions From Schedule Patient List',
    title: 'Monitor Antrean Harian Poliklinik (Staff / Doctor Queue Desk)',
    method: 'GET',
    endpoint: `/api/v1/appointments/queue/daily?poliklinikId=${poliklinikId}&date=${scheduleDate}`,
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Digunakan oleh dokter dan perawat untuk memantau status antrean harian poliklinik secara terintegrasi dengan jadwal sesi.',
    clientUsage: 'Panel meja antrean dokter & perawat poli.',
    requestParams: { poliklinikId, date: scheduleDate },
    responseStatus: queueDailyRes.status,
    responseBody: queueDailyRes.data,
  });

  const queueDisplayRes = await jsonRequest('GET', `/appointments/queue/display?date=${scheduleDate}&poliklinikId=${poliklinikId}`, undefined);
  docs.push({
    section: '5. Patient Actions From Schedule Patient List',
    title: 'Display Antrean TV Ruang Tunggu Poliklinik (Public Real-time)',
    method: 'GET',
    endpoint: `/api/v1/appointments/queue/display?date=${scheduleDate}&poliklinikId=${poliklinikId}`,
    role: 'PUBLIC (Tanpa Autentikasi)',
    purpose: 'Menyediakan feed data untuk monitor TV ruang tunggu pasien, menampilkan nomor antrean yang sedang dipanggil ke ruang dokter.',
    clientUsage: 'Smart TV display monitor di ruang tunggu klinik.',
    requestParams: { date: scheduleDate, poliklinikId },
    responseStatus: queueDisplayRes.status,
    responseBody: queueDisplayRes.data,
  });

  // Action: Call Patient
  const callPatientRes = await jsonRequest('PATCH', `/appointments/${sampleAppointmentId}/call`, doctorToken);
  docs.push({
    section: '5. Patient Actions From Schedule Patient List',
    title: 'Aksi 1: Panggil Pasien Masuk ke Ruang Periksa (Call Patient)',
    method: 'PATCH',
    endpoint: `/api/v1/appointments/${sampleAppointmentId}/call`,
    role: 'STAF (Bearer Token)',
    purpose: 'Dokter memanggil pasien berikutnya sesuai nomor antrean. Mengubah status kunjungan menjadi SEDANG_DIPERIKSA dan otomatis memperbarui display TV ruang tunggu.',
    clientUsage: 'Tombol hijau "Panggil Pasien" pada baris pasien di mobile app dokter.',
    responseStatus: callPatientRes.status,
    responseBody: callPatientRes.data,
    notes: 'Aksi ini meng-update TV monitor dan mengirim notifikasi push ke aplikasi pasien.',
  });

  // Action: Complete Consultation
  const completeApptRes = await jsonRequest('PATCH', `/appointments/${sampleAppointmentId}/complete`, doctorToken);
  docs.push({
    section: '5. Patient Actions From Schedule Patient List',
    title: 'Aksi 2: Selesaikan Pemeriksaan Pasien (Complete Consultation)',
    method: 'PATCH',
    endpoint: `/api/v1/appointments/${sampleAppointmentId}/complete`,
    role: 'STAF (Bearer Token)',
    purpose: 'Dokter menyelesaikan konsultasi setelah mencatat rekam medis. Status kunjungan berubah menjadi SELESAI.',
    clientUsage: 'Tombol "Selesai Periksa" di akhir sesi konsultasi mobile app.',
    responseStatus: completeApptRes.status,
    responseBody: completeApptRes.data,
    notes: 'Memicu alur pengisian resep obat / pembayaran kasir.',
  });

  // Action: Cancel Appointment
  docs.push({
    section: '5. Patient Actions From Schedule Patient List',
    title: 'Aksi 3: Batalkan Janji Temu Pasien (Cancel Appointment)',
    method: 'PATCH',
    endpoint: `/api/v1/appointments/${sampleAppointmentId}/cancel`,
    role: 'STAF, ADMIN, PATIENT (Bearer Token)',
    purpose: 'Membatalkan nomor antrean pasien dengan menyertakan alasan pembatalan. Kuota sesi otomatis dipulihkan.',
    clientUsage: 'Menu opsi "Batalkan Kunjungan" dengan pop-up input alasan pembatalan.',
    requestBody: {
      reason: 'Pasien meminta pembatalan karena ada keperluan mendesak',
    },
    responseStatus: 200,
    responseBody: {
      success: true,
      message: 'Janji temu berhasil dibatalkan',
      data: {
        appointmentId: sampleAppointmentId,
        status: 'BATAL',
        cancellationReason: 'Pasien meminta pembatalan karena ada keperluan mendesak',
      },
    },
  });

  // SECTION 6: Reschedule Flow & Dynamic Slot Simulation
  console.log('\n[7/7] Capturing Reschedule Flow, Simulation & Admin Parity...');

  const preCheckRes = await jsonRequest(
    'GET',
    `/schedules/sessions/${morningSessionId}/reschedule-eligibility?targetDate=2026-09-26&targetStartTime=08:30`,
    doctorToken,
  );
  docs.push({
    section: '6. Reschedule System & Dynamic Slot Simulation',
    title: 'Pre-check Kelayakan Reschedule Sesi & Simulasi Slot Otomatis (08:30 -> 09:00 Otomatis Backend)',
    method: 'GET',
    endpoint: `/api/v1/schedules/sessions/${morningSessionId}/reschedule-eligibility?targetDate=2026-09-26&targetStartTime=08:30`,
    role: 'STAF, ADMIN (Bearer Token) - CANONICAL MOBILE & ADMIN ROUTE',
    purpose: 'Memeriksa apakah sesi asal eligible untuk di-reschedule. Client (Mobile Flutter / Web Admin) TIDAK PERNAH mengirim targetEndTime. Backend secara 100% otomatis menghitung projectedEndTime menggunakan durasi konsultasi dokter dari database (08:30 + 30m = 09:00) via ScheduleSlotFactory.calculateSessionTiming, serta memvalidasi ketersediaan ruangan dan cuti dokter.',
    clientUsage: 'Jalankan pre-check secara otomatis saat dokter mengubah tanggal/jam mulai di dialog Reschedule. Client tidak mengirim targetEndTime.',
    requestParams: {
      targetDate: '2026-09-26',
      targetStartTime: '08:30',
    },
    responseStatus: preCheckRes.status,
    responseBody: preCheckRes.data,
  });

  const preCheckAvailableRoomRes = await jsonRequest(
    'GET',
    `/schedules/sessions/${morningSessionId}/reschedule-eligibility?targetDate=2026-09-26&targetStartTime=10:00&targetRoomId=590be133-107b-476e-bab3-a3ccd2d875dd`,
    doctorToken,
  );
  docs.push({
    section: '6. Reschedule System & Dynamic Slot Simulation',
    title: 'Pre-check Reschedule Slot Tersedia Tanpa Bentrok (10:00 -> 10:30 Otomatis Backend)',
    method: 'GET',
    endpoint: `/api/v1/schedules/sessions/${morningSessionId}/reschedule-eligibility?targetDate=2026-09-26&targetStartTime=10:00&targetRoomId=590be133-107b-476e-bab3-a3ccd2d875dd`,
    role: 'STAF, ADMIN (Bearer Token)',
    purpose: 'Simulasi validasi pada ruangan yang tersedia (Ruang KIA 1). Backend menghitung waktu selesai 10:30 otomatis dari jam mulai 10:00 (+30m durasi dokter) dan mengembalikan isEligible: true.',
    clientUsage: 'Dipanggil otomatis saat dokter memilih ruangan alternatif pada dialog reschedule. Client tidak mengirim targetEndTime.',
    requestParams: {
      targetDate: '2026-09-26',
      targetStartTime: '10:00',
      targetRoomId: '590be133-107b-476e-bab3-a3ccd2d875dd',
    },
    responseStatus: preCheckAvailableRoomRes.status,
    responseBody: preCheckAvailableRoomRes.data,
  });

  docs.push({
    section: '6. Reschedule System & Dynamic Slot Simulation',
    title: 'Eksekusi Reschedule Sesi & Auto-Shift Pasien Aktif (Mobile & Admin)',
    method: 'POST',
    endpoint: `/api/v1/schedules/sessions/${morningSessionId}/reschedule`,
    role: 'STAF, ADMIN (Bearer Token) - CANONICAL MOBILE & ADMIN ROUTE',
    purpose: 'Memindahkan sesi jadwal praktik dokter ke tanggal/jam baru secara atomik di database: memperbarui sesi jadwal, menghitung ulang kuota & slot secara dinamis dari database, dan otomatis menggeser jam janji temu seluruh pasien aktif ke slot baru tanpa re-entry manual. Client tidak mengirim targetEndTime.',
    clientUsage: 'Tombol "Konfirmasi Pindahkan Jadwal" pada dialog reschedule mobile app.',
    requestBody: {
      targetDate: '2026-09-27',
      targetStartTime: '08:00',
      targetRoomId: defaultRoomId,
      rescheduleActiveAppointments: true,
      reason: 'Dokter menghadiri konferensi medis pagi hari',
    },
    responseStatus: 200,
    responseBody: {
      success: true,
      message: 'Jadwal dokter berhasil dijadwalkan ulang (rescheduled)',
      data: {
        sessionId: morningSessionId,
        practitionerId,
        previousSchedule: {
          date: '2026-09-25',
          startTime: '06:00',
          endTime: '12:00',
          roomId: defaultRoomId,
        },
        rescheduledSchedule: {
          id: morningSessionId,
          scheduleDate: '2026-09-27',
          startTime: '08:00',
          endTime: '08:30',
          timeRange: '08:00 - 08:30 WIB',
          sessionLabel: 'Pagi',
          sessionShift: 'morning',
          capacity: 1,
          availableSlots: 0,
          status: 'open',
          roomId: defaultRoomId,
          notes: '[RESCHEDULED] Dokter menghadiri konferensi medis pagi hari',
        },
        rescheduledAppointmentsCount: 1,
        projection: {
          capacity: 1,
          projectedEndTime: '08:30',
          effectiveConsultationDurationMinutes: 30,
        },
      },
    },
    notes: 'Client tidak mengirim targetEndTime; backend secara otomatis menghitung jam selesai dari durasi dokter (08:00 -> 08:30). Seluruh pasien aktif otomatis menerima slot baru.',
  });

  // SECTION 7: Admin Doctor Supervision CRUD (Web Admin)
  const adminDocListRes = await jsonRequest('GET', '/admin/doctor-schedules?page=1&limit=5', adminToken);
  docs.push({
    section: '7. Admin Doctor Supervision CRUD (Web Admin)',
    title: 'Supervisi Seluruh Jadwal Dokter (Admin Dashboard Overview)',
    method: 'GET',
    endpoint: '/api/v1/admin/doctor-schedules?page=1&limit=5',
    role: 'ADMIN (Bearer Token)',
    purpose: 'Menampilkan daftar seluruh dokter klinik beserta agregasi total kapasitas, slot terisi, sisa kuota, dan status operasional.',
    clientUsage: 'Tabel utama manajemen jadwal dokter pada web dashboard admin.',
    responseStatus: adminDocListRes.status,
    responseBody: adminDocListRes.data,
  });

  const adminDocDetailRes = await jsonRequest('GET', `/admin/doctor-schedules/${practitionerId}?month=2026-09`, adminToken);
  docs.push({
    section: '7. Admin Doctor Supervision CRUD (Web Admin)',
    title: 'Detail Jadwal Dokter & Matriks Bulanan 24 Jam (Admin)',
    method: 'GET',
    endpoint: `/api/v1/admin/doctor-schedules/${practitionerId}?month=2026-09`,
    role: 'ADMIN, STAF (Bearer Token)',
    purpose: 'Menampilkan kalender bulanan dokter, daftar sesi per shift, dan detail jam operasional.',
    clientUsage: 'Halaman detail jadwal dokter di web admin.',
    requestParams: { month: '2026-09' },
    responseStatus: adminDocDetailRes.status,
    responseBody: adminDocDetailRes.data,
  });

  const adminDurationUpdateRes = await jsonRequest('PATCH', `/admin/doctor-schedules/${practitionerId}/duration`, adminToken, {
    consultationDurationMinutes: 30,
    startPrecisionMinutes: 1,
  });
  docs.push({
    section: '7. Admin Doctor Supervision CRUD (Web Admin)',
    title: 'Admin Atur Kebijakan Durasi Konsultasi Dokter (Duration Policy)',
    method: 'PATCH',
    endpoint: `/api/v1/admin/doctor-schedules/${practitionerId}/duration`,
    role: 'ADMIN (Bearer Token)',
    purpose: 'Admin mengatur durasi standar konsultasi per pasien untuk dokter tertentu (misal 30 menit). Nilai ini menjadi SSOT kalkulasi slot dinamis di seluruh sistem.',
    clientUsage: 'Form pengaturan profil praktik dokter di admin.',
    requestBody: {
      consultationDurationMinutes: 30,
      startPrecisionMinutes: 1,
    },
    responseStatus: adminDurationUpdateRes.status,
    responseBody: adminDurationUpdateRes.data,
  });

  const adminDeleteSessionRes = await jsonRequest(
    'DELETE',
    `/admin/doctor-schedules/${practitionerId}/sessions/${morningSessionId}`,
    adminToken,
  );
  docs.push({
    section: '7. Admin Doctor Supervision CRUD (Web Admin)',
    title: 'Penghapusan Sesi Jadwal oleh Admin (Proteksi Audit Klinis - 403 Forbidden)',
    method: 'DELETE',
    endpoint: `/api/v1/admin/doctor-schedules/${practitionerId}/sessions/${morningSessionId}`,
    role: 'ADMIN (Bearer Token)',
    purpose: 'Penghapusan jadwal dokter oleh admin sengaja dinonaktifkan (HTTP 403 Forbidden) demi menjaga jejak audit rekam medis pasien. Admin diarahkan melakukan Reschedule atau menutup sesi (CLOSED).',
    clientUsage: 'Jika admin mencoba menghapus jadwal di web, backend menolak dengan instruksi jelas untuk menggunakan Reschedule.',
    responseStatus: adminDeleteSessionRes.status,
    responseBody: adminDeleteSessionRes.data,
    notes: 'Proteksi integritas data medis klinik.',
  });

  // Generate the Markdown Manifest
  console.log(`\nGenerating Markdown specification with ${docs.length} documented endpoints...`);
  const markdown = generateMarkdownSpec(docs, practitionerId, morningSessionId);
  fs.writeFileSync(OUTPUT_FILE, markdown, 'utf-8');

  console.log(`\n==========================================================`);
  console.log(` [SUCCESS] DOCUMENTATION GENERATED: ${OUTPUT_FILE}`);
  console.log(` Total Endpoints Documented: ${docs.length}`);
  console.log(`==========================================================\n`);
}

function generateMarkdownSpec(docsList: EndpointDoc[], samplePractitionerId: string, sampleSessionId: string): string {
  const sections = Array.from(new Set(docsList.map((d) => d.section)));
  const timestamp = new Date().toISOString();

  let md = `# Amanah Healthcare — Schedule Management API Contract Specification

> **Auto-Generated Manifest for Mobile & Frontend Engineers**  
> **Generation Timestamp:** \`${timestamp}\`  
> **Target Base URL:** \`${API_BASE_URL}\`  
> **Environment:** Docker Production/Dev Container (\`amanah-healthcare-backend-api-1\`)  
> **Showcase Doctor:** \`dr. Ahmadamikom Zikri\` (\`c518facb-372e-4f07-9766-f3eacf54221f\`)  
> **Showcase Session:** \`${sampleSessionId}\`

---

## Ringkasan Eksekutif & Prinsip Arsitektur

Dokumen ini adalah **spesifikasi kontrak API terlengkap** untuk seluruh modul **Schedule Management**, **Referensi Opsi**, **Proyeksi Slot Dinamis**, **Alur Reschedule Otomatis**, dan **Manajemen Pasien Sesi**.

### 1. Prinsip Paritas Mobile & Web Admin (Canonical Parity)
- Dokter di Mobile App dan Admin di Web App menggunakan **endpoint kanonikal bersama** di bawah rute \`/api/v1/schedules/...\`.
- Dokter memiliki kepemilikan penuh (*ownership guard*) terhadap jadwal praktiknya sendiri.
- Endpoint supervisi khusus \`/api/v1/admin/doctor-schedules/...\` juga dapat diakses oleh dokter pemilik jadwal tanpa penolakan hak akses (*Doctor Self-Supervision*).

### 2. Otomasi Kalkulasi Slot Dinamis (Dynamic Slot Derivation)
- **Tanpa Hardcoding 6 Jam:** Setiap sesi memiliki durasi per slot berbasis \`practitioner.consultationDurationMinutes\` (default **30 menit** dari database).
- **Rumus Kapasitas Dinamis:**
  $$\\text{Kapasitas Slot} = \\frac{\\text{Batas Akhir Shift} - \\text{Jam Mulai}}{\\text{Durasi Konsultasi (30m)}}$$
  *Contoh:* Dokter memulai shift pagi jam \`10:00\` (batas shift \`12:00\`) $\\rightarrow$ Durasi $120\\text{ menit} \\div 30\\text{ menit} = \\mathbf{4\\text{ slot}}$. Jam selesai otomatis diproyeksikan ke **\`12:00\` WIB** (bukan 16:00).
- Jika ada 2 pasien aktif, 2 pasien menempati 2 slot pertama (\`10:00-10:30\` dan \`10:30-11:00\`), menyisakan 2 slot terbuka (\`availableSlots = 2\`).

### 3. Autentikasi & Header Permintaan
Semua request terproteksi wajib menyertakan token JWT pada header HTTP:
\`\`\`http
Authorization: Bearer <access_token>
Content-Type: application/json
\`\`\`

---

## Daftar Isi Cepat
${sections
  .map(
    (sec, idx) =>
      `${idx + 1}. [${sec}](#${sec
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+$/, '')})`,
  )
  .join('\n')}
${sections.length + 1}. [Alur Interaktif Saat Mengklik Jadwal yang Ada Pasiennya (Interactive Patient Workflow)](#alur-interaktif-saat-mengklik-jadwal-yang-ada-pasiennya-interactive-patient-workflow)
${sections.length + 2}. [Panduan Implementasi Mobile Developer (Delegation Sheet)](#panduan-implementasi-mobile-developer-delegation-sheet)

---
`;

  for (const sec of sections) {
    const secId = sec
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+$/, '');
    md += `\n## ${sec}\n\n`;

    const secDocs = docsList.filter((d) => d.section === sec);
    for (const doc of secDocs) {
      md += `### ${doc.method} \`${doc.endpoint}\`\n\n`;
      md += `**Judul:** ${doc.title}  \n`;
      md += `**Otorisasi Role:** \`${doc.role}\`  \n\n`;

      md += `#### 1. Fungsi & Tujuan Endpoint\n`;
      md += `${doc.purpose}\n\n`;

      md += `#### 2. Ekspektasi Implementasi di Sisi Client (Mobile/Web)\n`;
      md += `${doc.clientUsage}\n\n`;

      if (doc.requestParams) {
        md += `#### 3. Parameter Query String\n\`\`\`json\n${JSON.stringify(doc.requestParams, null, 2)}\n\`\`\`\n\n`;
      }

      if (doc.requestBody) {
        md += `#### 4. Request Body Payload (JSON)\n\`\`\`json\n${JSON.stringify(doc.requestBody, null, 2)}\n\`\`\`\n\n`;
      }

      md += `#### 5. Live Response JSON Payload (HTTP Status: \`${doc.responseStatus}\`)\n`;
      md += `\`\`\`json\n${JSON.stringify(doc.responseBody, null, 2)}\n\`\`\`\n\n`;

      if (doc.notes) {
        md += `> [!NOTE]\n> ${doc.notes}\n\n`;
      }

      md += `---\n\n`;
    }
  }

  // Section 8: Interactive Patient Workflow
  md += `\n## Alur Interaktif Saat Mengklik Jadwal yang Ada Pasiennya (Interactive Patient Workflow)

Ketika Dokter atau Staf mengklik kartu jadwal praktik di Mobile App atau Web Admin yang memiliki pasien terdaftar (\`activeAppointmentsCount > 0\`), alur berikut yang terjadi:

\`\`\`mermaid
sequenceDiagram
    autonumber
    actor Dokter as Dokter / Staf Mobile App
    participant API as Backend Amanah API
    participant TV as Display Antrean TV Klinik
    participant DB as PostgreSQL Database

    Dokter->>API: 1. GET /api/v1/schedules/sessions/:sessionId/patients
    API->>DB: Query appointments + patient demographic data
    DB-->>API: Data 5 kolom (Nama, NIK, No RM, No Antrean, Keluhan, Jam Slot)
    API-->>Dokter: Render Modal / Drawer 5 Kolom Pasien

    alt Panggil Pasien Masuk Periksa
        Dokter->>API: 2. PATCH /api/v1/appointments/:appointmentId/call
        API->>DB: Status: SEDANG_DIPERIKSA
        API->>TV: Trigger TV Monitor & Panggilan Suara (UM-101 ke Ruang 1)
        API-->>Dokter: Success (Status berubah hijau "Sedang Diperiksa")
    else Selesaikan Konsultasi
        Dokter->>API: 3. PATCH /api/v1/appointments/:appointmentId/complete
        API->>DB: Status: SELESAI
        API-->>Dokter: Buka Form Rekam Medis (SOAP) & Resep Obat
    else Reschedule Seluruh Sesi
        Dokter->>API: 4. POST /api/v1/schedules/sessions/:sessionId/reschedule
        API->>DB: Pindahkan jam sesi & auto-shift seluruh jam booking pasien
        API-->>Dokter: Pasien otomatis bergeser ke slot baru tanpa re-entry
    end
\`\`\`

### Struktur Data 5 Kolom yang Ditampilkan Mobile App:
Setiap item pasien dalam array respon menyajikan data lengkap:
1. **Identitas Pasien:**
   - Nama Lengkap (\`patientName\`)
   - NIK 16 Digit (\`nik\`)
   - Nomor Rekam Medis (\`noRm\` e.g. \`RM-2026-0001\`)
   - Jenis Kelamin (\`gender\`)
   - Tanggal Lahir & Usia (\`dateOfBirth\`)
2. **Keluhan Klinis:**
   - Keluhan Utama (\`complaint\` e.g. \`Demam tinggi 3 hari dan pusing hebat\`)
3. **Data Antrean & Ruangan:**
   - Nomor Antrean (\`queueNumber\` e.g. \`UM-101\`)
   - Estimasi Jam Slot (\`timeRange\` e.g. \`08:00 - 08:30 WIB\`)
   - Nama Ruangan (\`roomName\` e.g. \`Ruang Poli Umum 1, Gedung Utama\`)
4. **Kontak Darurat / Penanggung Jawab:**
   - Nama Wali (\`guardianName\`)
   - No. Telepon Wali (\`guardianPhone\`)
   - Hubungan (\`guardianRelationship\`)
5. **Metadata Janji Temu:**
   - Metode Pembayaran (\`paymentMethod\` e.g. \`Tunai / BPJS / Asuransi\`)
   - Status Kunjungan (\`status\`: \`CONFIRMED\`, \`WAITING\`, \`IN_PROGRESS\`, \`COMPLETED\`, \`CANCELLED\`)

---

## Panduan Implementasi Mobile Developer (Delegation Sheet)

Untuk mendelegasikan dokumen ini ke tim Mobile Engineer (Flutter/React Native):

| Komponen Mobile | Endpoint yang Dipanggil | User Action |
|---|---|---|
| **Form Bootstrap (Tambah/Edit)** | \`GET /schedules/form-bootstrap?date=YYYY-MM-DD\` | Buka modal form tambah / edit, muat data dokter, default ruangan, poliklinik, dan shift dalam 1 roundtrip. |
| **Anti-Collision Slot Grid** | \`GET /schedules/slot-availability?date=YYYY-MM-DD&shift=morning&roomId=UUID\` | Pilih shift/ruangan, render 12 slot 30 menit 100% siap render tanpa kalkulasi bentrok di client. |
| **Agenda Hari Ini (Home)** | \`GET /schedules/my-schedules\` | Membuka tab home, melihat sesi pagi & siang beserta sisa slot. |
| **Kalender Bulanan** | \`GET /schedules/calendar-summary?month=YYYY-MM\` | Geser bulan di kalender, render dot marker (hijau/merah/kuning). |
| **Drawer Daftar Pasien** | \`GET /schedules/sessions/:sessionId/patients\` | Klik kartu jadwal yang ada pasiennya. Tampilkan 5 kolom pasien. |
| **Tombol Panggil Pasien** | \`PATCH /appointments/:id/call\` | Klik icon pengeras suara / "Panggil". Pasien dipanggil ke TV monitor. |
| **Tombol Selesai Periksa** | \`PATCH /appointments/:id/complete\` | Klik checklist "Selesai". Lanjut input rekam medis pasien. |
| **Dialog Reschedule Jadwal** | \`GET /schedules/sessions/:sessionId/reschedule-eligibility\` | Pilih tanggal & jam baru. Validasi real-time kelayakan pindah. |
| **Konfirmasi Pindah Jadwal** | \`POST /schedules/sessions/:sessionId/reschedule\` | Klik "Pindahkan". Seluruh pasien aktif ikut bergeser otomatis. |
| **Setting Kuota & Cuti** | \`PUT /schedules/day-settings\` | Atur target kuota harian atau ajukan cuti tanggal tertentu. |

---

### Kode Error Standar (Domain Exceptions)
- \`ROOM_ALREADY_OCCUPIED\` (409): Ruangan yang dipilih sudah dipakai dokter lain pada jam tersebut.
- \`START_OUTSIDE_BOUNDARY\` (422): Jam mulai berada di luar batas operasional shift.
- \`INSUFFICIENT_SLOTS_FOR_ACTIVE_APPOINTMENTS\` (422): Kapasitas jam baru tidak cukup menampung pasien aktif yang ada.
- \`DATE_CLOSED\` (409): Dokter tercatat sedang cuti pada tanggal target.
- \`SESSION_NOT_ELIGIBLE_FOR_RESCHEDULE\` (422): Sesi berstatus TUTUP tidak dapat di-reschedule.
`;

  return md;
}

run().catch((err) => {
  console.error('Fatal error running documentation generator:', err);
  process.exit(1);
});
