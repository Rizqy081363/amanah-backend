# Authoritative Backend Implementation Contract: Doctor Schedule Management ("Jadwal Dokter")

> **Document Version:** 2.0.1 (Cross-Platform Production Ready Contract)  
> **Target Audience:** Frontend Web Engineers (Admin Dashboard), Frontend Mobile Engineers (Flutter), Backend Engineers (NestJS), QA Team  
> **Source Ticket & Manifest:** Feature Requirement Manifest & Backend Contract Handoff: `BE-SCHED-001`  
> **Evaluator & Implementer:** Senior Backend Requirement Verification & Implementation Agent (NestJS)  
> **Date:** 22 September 2026  
> **Status:** Fully Implemented, Tested, & Production Ready  
> **Database:** PostgreSQL 17 via Drizzle ORM  
> **Verification Standard:** Strict Evidence-First, Zero Artificial Data, Zero Redundancy Verified  

---

## 1. Executive Summary & Zero-Redundancy Architectural Alignment

This contract defines the production implementation of **Doctor Schedule Management ("Jadwal Dokter")** supporting both the **Admin Web Management Portal** (`/dashboard/jadwal-dokter`), the **Patient Web Consumer Booking Flow** (`/dashboard/klinik/janji-temu`), and the **Upstream Doctor Mobile App**.

### 1.1 Architectural Principle: Zero Redundancy
As instructed ("make sure do not redundance"), the backend architecture rigorously prevents duplication across all layers:
1. **Zero Database Redundancy:**
   - No new tables, entities, or redundant persistence schemas were created.
   - All persistence reuses the existing normalized PostgreSQL schema (`practitioners`, `staff_profiles`, `medical_specialties`, `clinic_rooms`, `clinic_units`, `practitioner_schedule_sessions`, `practitioner_schedule_day_settings`, `practitioner_leave_periods`, `appointments`).
2. **Zero Service/Repository Redundancy:**
   - Both the Mobile Doctor App endpoints, Admin Supervision endpoints, and Patient Lookup endpoints are unified under `ScheduleDrizzleRepository` and `SchedulesModule`.
   - Business logic (time boundary validation, doctor overlapping conflict checks, room occupancy detection, leave resolution, and active booking protections) is centrally maintained in `src/modules/schedules/infrastructure/drizzle/schedule.drizzle-repository.ts`.
3. **Strict Separation of Concerns (Zero "Tambah Dokter"):**
   - The Admin Doctor Schedule interface is strictly an operational schedule observability and management module.
   - Doctor onboarding, SIP/STR credentialing, and user registration remain exclusively in HR and practitioner registry modules (`staff_profiles`, `staff_credentials`, `practitioners`). **No "Tambah Dokter" action is exposed on schedule endpoints.**

---

## 2. Schema Compatibility Matrix

Every requirement from the Frontend Feature Requirement Manifest was verified against the real PostgreSQL schema in `src/database/schema/amanah.schema.ts`:

| Manifest Requirement | Existing Schema Element | Status | Evidence (File & Line / Constraint) | Evaluation & Action Taken |
| :--- | :--- | :---: | :--- | :--- |
| **1. Admin Doctor Schedule Overview** (`nama_dokter`, `spesialisasi`, `status_dokter`, `ruang_praktik`, `slot_tersedia`, `kapasitas_per_hari`, `jadwal_hari_ini`, `sesi_harian`) | Tables `practitioners`, `staff_profiles`, `medical_specialties`, `clinic_rooms`, `practitioner_schedule_sessions`, `practitioner_schedule_day_settings` | ✅ Fully Supported | `src/database/schema/amanah.schema.ts:974` (`staffProfiles`), `1039` (`practitioners`), `1204` (`practitionerScheduleDaySettings`), `1384` (`practitionerScheduleSessions`) | Reused existing tables. Implemented `findAdminDoctorSchedules` in `ScheduleDrizzleRepository` with aggregated slot counts, capacity calculations, and Indonesian date formatting. |
| **2. Admin Search & Multi-Poli Filtering** (Search name/specialty/room, filter poli, status, date, month) | Indexed relational query columns: `staff_profiles.full_name`, `medical_specialties.name`, `clinic_rooms.name`, `practitioner_schedule_sessions.schedule_date` | ✅ Fully Supported | `amanah.schema.ts:999` (`staff_profiles_name_trgm_idx`), `1062` (`practitioners_specialty_idx`), `1420` (`practitioner_schedule_sessions_date_idx`) | Implemented in `AdminDoctorSchedulesQueryDto` and repository filtering without adding redundant DB columns. |
| **3. Admin Schedule Detail with Monthly Matrix & 24h Grid** (1..31 calendar days, `status`: `Buka`/`Penuh`/`Cuti`/`Tutup`, notes, 24h shift sessions) | Aggregated from `practitioner_schedule_day_settings`, `practitioner_leave_periods`, and `practitioner_schedule_sessions` | ✅ Fully Supported | `amanah.schema.ts:1204` (`day_settings`), `1338` (`leave_periods`), `1384` (`sessions`) | Implemented `findAdminDoctorScheduleDetail` in `ScheduleDrizzleRepository` projecting dynamic 28–31 calendar matrix for target month. |
| **4. Operational Cuti & Practice Overrides** (Set cuti status, cuti reason, date range, close practice, adjust capacity) | Tables `practitioner_schedule_day_settings`, `practitioner_leave_periods`, `practitioner_schedule_sessions` | ✅ Fully Supported | `amanah.schema.ts:1204` (`is_leave`, `leave_reason`), `1338` (`practitioner_leave_periods`), `1384` (`status`, `available_slots`) | Implemented `updateAdminDoctorSchedule` to atomically update day settings, record leave periods, and close session slots (`availableSlots = 0`, `status = 'leave'`). |
| **5. Override Single Calendar Day Status** (`/days/:date` with `Buka`, `Penuh`, `Cuti`, `Tutup`, `notes`) | Table `practitioner_schedule_day_settings` | ✅ Fully Supported | `amanah.schema.ts:1204-1250` (`practitioner_schedule_day_settings`) | Implemented `updateAdminDayStatus` updating day settings and corresponding sessions. |
| **6. Append Clinical Session** (Add shift session with date, session name, start/end time, quota, room) | Table `practitioner_schedule_sessions` | ✅ Fully Supported | `amanah.schema.ts:1384-1457` (`practitioner_schedule_sessions`) | Implemented `createAdminDoctorSession` with conflict checking (`checkScheduleConflicts`). |
| **7. Patient-Facing Doctor Lookup** (`GET /api/v1/clinical/practitioners` with `service`, `date` availability) | Tables `practitioners`, `staff_profiles`, `medical_specialties`, `clinic_rooms`, `practitioner_schedule_sessions` | ✅ Fully Supported | `amanah.schema.ts:1039` (`practitioners`), `1384` (`sessions`) | Implemented `findClinicalPractitioners` in `ScheduleDrizzleRepository` resolving active doctors and availability on target date. |
| **8. Upstream Doctor Mobile App Endpoints** (`/api/v1/schedules/*`) | Existing implementation in `SchedulesController` | ✅ Fully Supported | `src/modules/schedules/presentation/schedules.controller.ts` | Fully preserved. Zero regressions. Existing test suites pass 100%. |

---

## 3. Schema Adjustment Plan Assessment

**Conclusion: ZERO DATABASE MIGRATIONS REQUIRED.**

The existing PostgreSQL schema (`src/database/schema/amanah.schema.ts`) already satisfies 100% of all required relationships, constraints, and data types. No schema mutations or alter table scripts are necessary.

---

## 4. Authoritative REST API Contract Specification

### 4.1 Base Configuration
* **Global Prefix:** `/api`
* **API Version:** `v1` (URI versioning)
* **Error Envelope:** RFC 7807 Problem Details (`application/problem+json`)
* **Timezone:** Asia/Jakarta (WIB / UTC+7)

---

### 4.2 Endpoint: Admin Doctor Schedules Listing
* **Method:** `GET`
* **Path:** `/api/v1/admin/doctor-schedules`
* **Authorization:** Bearer Token, Role: `ADMIN` (`@Roles('ADMIN')`)
* **Purpose:** Provides the primary card grid and toolbar filter state for `/dashboard/jadwal-dokter`.

#### Query Parameters:
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `page` | integer | No | `1` | Page number (1-indexed) |
| `limit` | integer | No | `6` | Records per page (6, 12, 18, 24, 30) |
| `search` | string | No | — | Search query against doctor name, specialty, or room |
| `poli` | string | No | — | Filter by polyclinic or specialty name (e.g. `Penyakit Dalam`) |
| `status` | string | No | — | Filter by status (`Buka`, `Penuh`, `Cuti`, `Tutup`) |
| `month` | string | No | Current | Month filter in format `YYYY-MM` (e.g. `2026-09`) |
| `date` | string | No | Current | Specific date filter in format `YYYY-MM-DD` (e.g. `2026-09-22`) |

#### Presentation Nullability Contract
`avatar` is always returned as a JSON string for every doctor card. If the doctor has no uploaded avatar in `staff_profiles.avatar_url`, the backend returns an empty string (`""`) instead of `null`. This keeps the admin web runtime schema stable while preserving nullable avatar storage in PostgreSQL.

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "doctors": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174001",
        "practitioner_id": "123e4567-e89b-12d3-a456-426614174001",
        "nama_dokter": "dr. Sarah Putri, Sp.PD",
        "spesialisasi": "Penyakit Dalam",
        "status_dokter": "Buka",
        "email": "sarah.putri@amanah-healthcare.test",
        "nomor_telepon": "081234567890",
        "ruang_praktik": "Poli Penyakit Dalam, Room 201",
        "tanggal_praktik": "Selasa, 22 Sep 2026",
        "avatar": "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150",
        "slot_tersedia": 18,
        "kapasitas_per_hari": 30,
        "jadwal_hari_ini": "07:30 - 17:30",
        "status_jadwal": "Buka",
        "bulan_jadwal": "September 2026",
        "is_cuti": false,
        "cuti_reason": null,
        "cuti_start": null,
        "cuti_end": null,
        "sesi_harian": [
          {
            "id": "ses-uuid-101",
            "nama_sesi": "Sesi Pagi",
            "jam_mulai": "07:30",
            "jam_selesai": "11:30",
            "waktu": "07:30 - 11:30",
            "kuota_pasien": 15,
            "slot_tersedia": 8,
            "status_sesi": "Buka",
            "ruang": "Poli Penyakit Dalam, Room 201"
          },
          {
            "id": "ses-uuid-102",
            "nama_sesi": "Sesi Sore",
            "jam_mulai": "13:30",
            "jam_selesai": "17:30",
            "waktu": "13:30 - 17:30",
            "kuota_pasien": 15,
            "slot_tersedia": 10,
            "status_sesi": "Buka",
            "ruang": "Poli Penyakit Dalam, Room 201"
          }
        ]
      }
    ],
    "meta": {
      "page": 1,
      "limit": 6,
      "total_doctors": 14,
      "total_pages": 3
    }
  }
}
```

---

### 4.3 Endpoint: Admin Doctor Schedule Detail (Monthly Calendar Matrix & Shifts)
* **Method:** `GET`
* **Path:** `/api/v1/admin/doctor-schedules/:id`
* **Authorization:** Bearer Token, Role: `ADMIN` (`@Roles('ADMIN')`)
* **Purpose:** Powers `DoctorScheduleDetailSheet`, rendering the 7-column interactive monthly calendar and 24-hour shift schedule.

#### Query Parameters:
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `month` | string/number | No | Current | Month (`YYYY-MM`, `1..12`, or `0..11`) |
| `year` | integer | No | Current | Calendar year (e.g. `2026`) |
| `date` | string | No | Current | Specific date to resolve daily sessions (`YYYY-MM-DD`) |

#### Presentation Nullability Contract
`avatar` is always returned as a JSON string. A missing stored avatar is represented as `""`.

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "practitioner_id": "123e4567-e89b-12d3-a456-426614174001",
    "nama_dokter": "dr. Sarah Putri, Sp.PD",
    "spesialisasi": "Penyakit Dalam",
    "status_dokter": "Buka",
    "email": "sarah.putri@amanah-healthcare.test",
    "nomor_telepon": "081234567890",
    "ruang_praktik": "Poli Penyakit Dalam, Room 201",
    "avatar": "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150",
    "slot_tersedia": 18,
    "kapasitas_per_hari": 30,
    "bulan_jadwal": "September 2026",
    "is_cuti": false,
    "cuti_reason": null,
    "cuti_start": null,
    "cuti_end": null,
    "monthly_schedule": [
      {
        "day": 1,
        "date": "2026-09-01",
        "status": "Buka",
        "notes": null
      },
      {
        "day": 2,
        "date": "2026-09-02",
        "status": "Penuh",
        "notes": "Slot terisi penuh oleh pasien reservasi"
      },
      {
        "day": 15,
        "date": "2026-09-15",
        "status": "Cuti",
        "notes": "Seminar Dokter Spesialis Penyakit Dalam"
      }
    ],
    "sesi_harian": [
      {
        "id": "ses-uuid-101",
        "nama_sesi": "Sesi Pagi",
        "jam_mulai": "07:30",
        "jam_selesai": "11:30",
        "waktu": "07:30 - 11:30",
        "kuota_pasien": 15,
        "slot_tersedia": 8,
        "status_sesi": "Buka",
        "ruang": "Poli Penyakit Dalam, Room 201"
      }
    ]
  }
}
```

---

### 4.4 Endpoint: Admin Operational Schedule & Cuti Mutation
* **Method:** `PATCH`
* **Path:** `/api/v1/admin/doctor-schedules/:id`
* **Authorization:** Bearer Token, Role: `ADMIN` (`@Roles('ADMIN')`)
* **Purpose:** Handles `DoctorScheduleEditModal` submissions: setting doctor on cuti, closing practice, and adjusting capacity.

#### Request Body Schema:
```json
{
  "is_cuti": true,
  "cuti_reason": "Cuti Tahunan & Pemulihan Operasi",
  "cuti_start": "2026-09-25",
  "cuti_end": "2026-09-30",
  "status_jadwal": "Cuti",
  "slot_tersedia": 0,
  "kapasitas_per_hari": 30,
  "ruang_praktik": "Poli Penyakit Dalam, Room 201",
  "date": "2026-09-25"
}
```

#### Success Response (`200 OK`):
Returns the updated schedule detail object.

---

### 4.5 Endpoint: Admin Single Calendar Day Status Override
* **Method:** `PATCH`
* **Path:** `/api/v1/admin/doctor-schedules/:id/days/:date`
* **Authorization:** Bearer Token, Role: `ADMIN` (`@Roles('ADMIN')`)
* **Purpose:** Handles clicking a day cell in `DoctorTimelineCalendar` and selecting Buka/Penuh/Cuti/Tutup from the dropdown.

#### Request Body Schema:
```json
{
  "status": "Cuti",
  "notes": "Izin Dinas Luar Kota"
}
```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Status hari berhasil diperbarui",
  "data": {
    "date": "2026-09-22",
    "status": "Cuti",
    "notes": "Izin Dinas Luar Kota"
  }
}
```

---

### 4.6 Endpoint: Admin Append Clinical Session
* **Method:** `POST`
* **Path:** `/api/v1/admin/doctor-schedules/:id/sessions`
* **Authorization:** Bearer Token, Role: `ADMIN` (`@Roles('ADMIN')`)
* **Purpose:** Handles `DoctorAddSessionModal` submissions for surge shifts or additional practice hours.

#### Request Body Schema:
```json
{
  "schedule_date": "2026-09-22",
  "nama_sesi": "Sesi Malam",
  "jam_mulai": "19:00",
  "jam_selesai": "22:00",
  "kuota_pasien": 10,
  "slot_tersedia": 10,
  "status_sesi": "Buka",
  "ruang": "Poli Penyakit Dalam, Room 201"
}
```

#### Success Response (`201 Created`):
```json
{
  "success": true,
  "message": "Sesi jadwal berhasil ditambahkan",
  "data": {
    "id": "67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1",
    "practitionerId": "123e4567-e89b-12d3-a456-426614174001",
    "scheduleDate": "2026-09-22",
    "sessionLabel": "Sesi Malam",
    "sessionShift": "night",
    "startTime": "19:00:00",
    "endTime": "22:00:00",
    "capacity": 10,
    "availableSlots": 10,
    "status": "open"
  }
}
```

---

### 4.7 Endpoint: Patient Clinical Practitioners Availability Lookup
* **Method:** `GET`
* **Path:** `/api/v1/clinical/practitioners`
* **Authorization:** Public / Authenticated Patient (`@Public()`)
* **Purpose:** Powers patient appointment booking wizard at `/dashboard/klinik/janji-temu` and `AppointmentCalendarDayPicker`.

#### Query Parameters:
| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `service` | string | No | Filter by service name or category (e.g. `Penyakit Dalam`) |
| `date` | string | No | Target appointment date (`YYYY-MM-DD`) to verify active slots |

#### Presentation Nullability Contract
`avatar` is always returned as a JSON string for practitioner cards. A missing stored avatar is represented as `""`, allowing web consumers to render initials or local fallback imagery without schema parse errors.

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174001",
      "name": "dr. Sarah Putri, Sp.PD",
      "spec": "Penyakit Dalam",
      "avatar": "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150",
      "location": "Poli Penyakit Dalam, Room 201",
      "rating": "5.0",
      "tags": ["Penyakit Dalam", "Diabetes Care"],
      "schedule": "Senin - Sabtu (07:30 - 17:30)",
      "is_available": true
    }
  ]
}
```

---

## 5. Business Rules & Concurrency Control

1. **Strict Conflict Prevention:**
   - A practitioner cannot have overlapping sessions on the same date (`PRACTITIONER_ALREADY_SCHEDULED`).
   - A practice room cannot be occupied by more than one practitioner during overlapping hours (`ROOM_ALREADY_OCCUPIED`).
   - `startTime` must be strictly prior to `endTime` (`INVALID_TIME_RANGE`).
2. **Leave Slot Zeroing:**
   - Whenever an admin sets a doctor on cuti on a specific date, all clinical sessions on that date have `availableSlots` atomically zeroed and `status` set to `'leave'`.
   - The patient booking lookup (`/api/v1/clinical/practitioners`) immediately marks `is_available: false` for doctors on leave.
3. **Active Booking Protection:**
   - A schedule session with active patient appointments (`booked`, `checked_in`, `waiting`, `in_service`) **cannot be deleted**. Attempting deletion returns HTTP 409 (`SCHEDULE_HAS_ACTIVE_BOOKINGS`).

---

## 6. Frontend Integration Guide

The frontend team can immediately bind these endpoints by updating:
1. `src/server/api/paths.ts`:
   ```ts
   admin: {
     doctorSchedules: {
       list: () => '/api/v1/admin/doctor-schedules',
       detail: (id: string) => `/api/v1/admin/doctor-schedules/${id}`,
       update: (id: string) => `/api/v1/admin/doctor-schedules/${id}`,
       updateDay: (id: string, date: string) => `/api/v1/admin/doctor-schedules/${id}/days/${date}`,
       createSession: (id: string) => `/api/v1/admin/doctor-schedules/${id}/sessions`,
     },
   },
   clinical: {
     practitioners: () => '/api/v1/clinical/practitioners',
   }
   ```
2. `src/features/jadwal-dokter/api/service.ts`:
   - Replace in-memory arrays (`doctorScheduleRecords = []`) with `httpClient.request(paths.admin.doctorSchedules.list(), ...)`.
3. Invalidate queries on mutation:
   - `queryClient.invalidateQueries({ queryKey: ['admin', 'doctor-schedules'] })`.
