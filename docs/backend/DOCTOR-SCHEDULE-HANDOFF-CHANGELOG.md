# Changelog & Frontend Handoff: Doctor Schedule Management ("Jadwal Dokter")

> **Ticket ID:** `BE-SCHED-001`  
> **Source Manifest:** Doctor Schedule Management — Cross-Platform Capability Audit & Backend Contract Specification  
> **Author:** Senior Backend Engineering Team (NestJS Core API)  
> **Target Audience:** Frontend Web Team (`fadhiilahahmadzikri/Amanah-healthcare`), Mobile Flutter Team, QA Team  
> **Date:** 22 September 2026  
> **Environment & Runtime:** Bun v1.2.19, Docker Compose (`postgres:17.9-alpine`, `redis:7-alpine`), NestJS 11, Drizzle ORM  
> **Handoff Maturity:** Production-Ready & Verified Live in Docker / Bun Runner  

---

## 1. Executive Summary & Architectural Reality

This document provides the authoritative, production-ready backend handoff and changelog for the **Doctor Schedule Management ("Jadwal Dokter")** feature. It enables the Frontend Web team to eliminate all local mock arrays and dead JSON files, binding directly to verified NestJS REST endpoints.

### 1.1 Key Principles Adhered To
1. **Zero Database Redundancy ("make sure do not redundance"):**
   - **0 New Migrations / 0 Duplicate Tables:** The existing PostgreSQL schema in `src/database/schema/amanah.schema.ts` already contains all required tables (`practitioners`, `staff_profiles`, `medical_specialties`, `clinic_rooms`, `clinic_units`, `practitioner_schedule_sessions`, `practitioner_schedule_day_settings`, `practitioner_leave_periods`, `appointments`).
   - No parallel models, duplicate services, or detached tables were introduced.
2. **Zero "Tambah Dokter" on Schedule Interface:**
   - The Admin Schedule Management view (`/dashboard/jadwal-dokter`) is strictly operational.
   - Doctor onboarding, credentialing (STR/SIP), and profile creation remain strictly separated in the HR and Practitioner Registry modules (`staff_profiles`, `staff_credentials`, `practitioners`).
3. **Cross-Platform Single Source of Truth:**
   - The Upstream Mobile Doctor App (`/api/v1/schedules/*`), Admin Management Web Portal (`/api/v1/admin/doctor-schedules`), and Patient Booking Portal (`/api/v1/clinical/practitioners`) all read and write to the same relational tables via `ScheduleDrizzleRepository`.

---

## 2. Server Configuration & Network Base URLs

Depending on your testing and running environment, use the following base addresses:

| Environment | Base URL | Notes |
| :--- | :--- | :--- |
| **Next.js Web Frontend (Host)** | `http://localhost:3001` or `http://127.0.0.1:3001` | Mapped directly from Docker container port `3001` |
| **Docker Compose (Internal)** | `http://api:3001` | Service name inside docker network |
| **Android Emulator (Mobile)** | `http://10.0.2.2:3001` | Standard Android loopback to host |
| **iOS Simulator (Mobile)** | `http://localhost:3001` | Host loopback on macOS |

### Authentication Requirements
- **Admin Management Endpoints (`/api/v1/admin/doctor-schedules/*`):**
  - Requires active session with role `ADMIN`.
  - Header: `Authorization: Bearer <token>` or Better-Auth session cookie.
- **Patient Lookup Endpoint (`/api/v1/clinical/practitioners`):**
  - Public / Patient accessible (`@Public()`), supports session context for active patient booking.

---

## 3. Authoritative API Endpoints & Contract Reference

### 3.0. Cross-Consumer Nullability Decision

For admin and patient-facing doctor cards, `avatar` is a non-null JSON string. If `staff_profiles.avatar_url` is empty in PostgreSQL, the backend returns:

```json
{
  "avatar": ""
}
```

Do not model `data.doctors[*].avatar` or `data[*].avatar` as nullable in the Next.js runtime schemas. Use the empty string as the "no uploaded avatar" state and render initials or a local fallback image. This decision applies to:

- `GET /api/v1/admin/doctor-schedules`
- `GET /api/v1/admin/doctor-schedules/:id`
- `GET /api/v1/clinical/practitioners`

It does not change booked patient `avatarUrl`; patient avatar URLs remain nullable in the booked-patient contract.

### 3.1. List Doctor Schedules (Admin Overview & Filter Cards)
- **Method:** `GET`
- **Path:** `/api/v1/admin/doctor-schedules`
- **Purpose:** Hydrates `/dashboard/jadwal-dokter` card grid, search bar, and toolbar filters.

#### Query Parameters:
| Param | Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `page` | integer | No | `1` | Page number (1-indexed) |
| `limit` | integer | No | `6` | Cards per page (`6`, `12`, `18`, `24`, `30`) |
| `search` | string | No | — | Fuzzy search on doctor name, specialty, room |
| `clinicRoomId` | string (UUID) | No | — | Filter by specific practice room |
| `specialtyId` | string (UUID) | No | — | Filter by medical specialty ID |
| `status` | string | No | — | Filter by status (`Buka`, `Penuh`, `Cuti`, `Tutup`) |
| `month` | string | No | Current | Month filter `YYYY-MM` (e.g. `2026-09`) |
| `date` | string | No | Current | Specific date `YYYY-MM-DD` (e.g. `2026-09-22`) |

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
        "jadwal_hari_ini": "07:30 - 11:30",
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

### 3.2. Get Doctor Schedule Detail (Monthly Matrix & 24h Shift Sessions)
- **Method:** `GET`
- **Path:** `/api/v1/admin/doctor-schedules/:practitionerId`
- **Purpose:** Hydrates `DoctorScheduleDetailSheet` (Tab 1: Kalender & Tab 2: Jadwal & Kuota).

#### Query Parameters:
| Param | Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `month` | integer | No | Current month (0-11) | Month index (0 = Januari, 8 = September) |
| `year` | integer | No | Current year (e.g. 2026) | Calendar year |

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
        "day": 15,
        "date": "2026-09-15",
        "status": "Cuti",
        "notes": "Seminar Dokter Spesialis"
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

### 3.3. Update Operational Schedule & Cuti
- **Method:** `PUT`
- **Path:** `/api/v1/admin/doctor-schedules/:practitionerId`
- **Purpose:** Used by `DoctorScheduleEditModal` to toggle leave status, set reasons, adjust capacities, or close practice.

#### Request Body (`UpdateAdminDoctorScheduleDto`):
```json
{
  "is_cuti": true,
  "cuti_reason": "Cuti Tahunan & Pemulihan Operasi",
  "cuti_start": "2026-09-25",
  "cuti_end": "2026-09-30",
  "status_jadwal": "Cuti / Tutup",
  "slot_tersedia": 0,
  "kapasitas_per_hari": 30,
  "ruang_praktik": "Poli Penyakit Dalam, Room 201"
}
```

#### Success Response (`200 OK`):
Returns the updated `AdminDoctorScheduleDetailResponse` object.

---

### 3.4. Update Single Day Calendar Status
- **Method:** `PATCH`
- **Path:** `/api/v1/admin/doctor-schedules/:practitionerId/day-status`
- **Purpose:** Used by day-level dropdowns in `DoctorTimelineCalendar` to toggle single day states.

#### Request Body (`UpdateAdminDayStatusDto`):
```json
{
  "date": "2026-09-22",
  "status": "Cuti",
  "reason": "Izin Sakit Mendadak"
}
```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "practitionerId": "123e4567-e89b-12d3-a456-426614174001",
    "date": "2026-09-22",
    "status": "Cuti",
    "reason": "Izin Sakit Mendadak"
  }
}
```

---

### 3.5. Append Clinical Session Shift
- **Method:** `POST`
- **Path:** `/api/v1/admin/doctor-schedules/:practitionerId/sessions`
- **Purpose:** Used by `DoctorAddSessionModal` to append a surge or extra practice shift.

#### Request Body (`CreateAdminDoctorSessionDto`):
```json
{
  "schedule_date": "2026-09-22",
  "nama_sesi": "Sesi Malam",
  "jam_mulai": "18:00",
  "jam_selesai": "21:00",
  "kuota_pasien": 15,
  "slot_tersedia": 15,
  "status_sesi": "Buka",
  "ruang": "Poli Penyakit Dalam, Room 201"
}
```

#### Success Response (`201 Created`):
Returns created session record. Note: Returns `409 Conflict` if the session times overlap with existing doctor shifts or double-books the clinic room.

---

### 3.6. Clinical Practitioners (Patient Booking Lookup)
- **Method:** `GET`
- **Path:** `/api/v1/clinical/practitioners`
- **Purpose:** Hydrates `/dashboard/klinik/janji-temu` (`AppointmentCalendarDayPicker`).

#### Query Parameters:
| Param | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `search` | string | No | Doctor name or specialty |
| `specialtyId` | string (UUID) | No | Medical specialty filter |
| `clinicUnitId` | string (UUID) | No | Clinic unit / Polyclinic filter |
| `date` | string | No | Evaluates availability on specific `YYYY-MM-DD` |

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
      "tags": ["Penyakit Dalam", "Konsultasi Umum"],
      "schedule": "Senin - Jumat (08:00 - 14:00)",
      "is_available": true
    }
  ]
}
```

---

## 4. Step-by-Step Frontend Integration Guide

The Frontend Web Team can follow this checklist to complete end-to-end integration:

### Step 1: Confirm Legacy Static Mocks Stay Removed
The following files have been deleted from the web admin source tree and must not be reintroduced:
* `src/constants/mock-data/doctor-schedules.json` (legacy static schedule mock)
* `src/constants/mock-api-doctor-schedules.ts` (legacy hardcoded May 2026 generators)

### Step 2: Register API Paths in Frontend Router
In `src/server/api/paths.ts`, add:
```typescript
export const paths = {
  // ... existing paths
  adminDoctorSchedules: {
    list: (params?: Record<string, any>) => `/api/v1/admin/doctor-schedules${toQueryString(params)}`,
    detail: (id: string, params?: { month?: number; year?: number }) =>
      `/api/v1/admin/doctor-schedules/${id}${toQueryString(params)}`,
    update: (id: string) => `/api/v1/admin/doctor-schedules/${id}`,
    updateDayStatus: (id: string) => `/api/v1/admin/doctor-schedules/${id}/day-status`,
    createSession: (id: string) => `/api/v1/admin/doctor-schedules/${id}/sessions`,
  },
  clinicalPractitioners: {
    list: (params?: Record<string, any>) => `/api/v1/clinical/practitioners${toQueryString(params)}`,
  },
};
```

### Step 3: Wire Frontend Service Layer
In `src/features/jadwal-dokter/api/service.ts`, replace the empty array `doctorScheduleRecords = []` with real HTTP calls:
```typescript
import { httpClient } from '@/server/http/http-client';
import { paths } from '@/server/api/paths';

export async function getDoctorSchedules(filters: DoctorScheduleFilters) {
  const response = await httpClient.request<AdminDoctorScheduleListResponse>({
    url: paths.adminDoctorSchedules.list(filters),
    method: 'GET',
  });
  return response.data;
}

export async function getDoctorScheduleById(id: string, month?: number, year?: number) {
  const response = await httpClient.request<AdminDoctorScheduleDetailResponse>({
    url: paths.adminDoctorSchedules.detail(id, { month, year }),
    method: 'GET',
  });
  return response.data;
}

export async function updateDoctorSchedule(id: string, payload: UpdateDoctorSchedulePayload) {
  const response = await httpClient.request({
    url: paths.adminDoctorSchedules.update(id),
    method: 'PUT',
    data: payload,
  });
  return response.data;
}
```

### Step 4: React Query Invalidation
In `src/features/jadwal-dokter/api/mutations.ts`, invalidate queries upon update:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['doctor-schedules'] });
}
```

### Step 5: Dynamic Calendar Offset
In `src/features/jadwal-dokter/components/doctor-calendar-grid.tsx`:
- Remove hardcoded Friday offset (`const startOffset = 4;`).
- Use standard dynamic day offset:
  ```typescript
  const startDay = new Date(selectedYear, selectedMonth, 1).getDay();
  // Adjust if Monday is day 0: (startDay + 6) % 7
  ```

---

## 5. Verification & Test Evidence (Bun & Docker Stack)

All verification gates were executed using the repository's native runner **Bun (v1.2.19)** and **Docker**:

```bash
# 1. Verification of Docker Stack
bun run infra:ps
# Output:
# amanah-healthcare-backend-postgres-1: Up (healthy) on port 5433
# amanah-healthcare-backend-redis-1:    Up (healthy) on port 6379
# amanah-healthcare-backend-api-1:      Up (healthy) on port 3001

# 2. Test Execution
bun run test -- schedules
# Output:
# PASS src/modules/schedules/presentation/clinical-practitioners.controller.spec.ts
# PASS src/modules/schedules/presentation/admin-doctor-schedules.controller.spec.ts
# PASS src/modules/schedules/presentation/schedules.controller.spec.ts
# Test Suites: 3 passed, 3 total
# Tests:       22 passed, 22 total
# Snapshots:   0 total
# Time:        10.051 s

# 3. Clean Build Execution
bun run build
# Output:
# $ rimraf dist
# $ nest build
# Exit code 0 (clean dist artifacts generated)

# 4. Biome Linter & Code Quality
bun x @biomejs/biome check src/modules/schedules
# Output:
# Checked 24 files in 42ms. No fixes applied. (0 errors, 0 warnings)

# 5. Live E2E Reality Check Suite (scripts/e2e/test-admin-doctor-schedules-reality.ps1)
# Executed against live Docker container at http://localhost:3001 and PostgreSQL on port 5433:
#
# ================================================================================
#  STARTING REAL LIVE ENDPOINT VERIFICATION (TICKET: BE-SCHED-001)
#  Target Base URL: http://localhost:3001
# ================================================================================
#
# === 1. Security & RBAC Enforcement Gate ===
#  [PASS] GET /api/v1/admin/doctor-schedules (No Token) -> 401 Unauthorized
#  [PASS] GET /api/v1/admin/doctor-schedules (Doctor Token) -> 403 Forbidden
#  [PASS] Admin Login -> Bearer Token Acquired
#
# === 2. Testing GET /api/v1/admin/doctor-schedules (Live Admin Card Overview) ===
#  [PASS] GET /api/v1/admin/doctor-schedules succeeds (200 OK)
#  [PASS] Response latency under operational budget (< 500ms)
#  [PASS] Overview contains doctors array
#  [PASS] Overview contains pagination metadata
#  [PASS] Doctor card has required fields (nama_dokter, spesialisasi, status_dokter, slot_tersedia, kapasitas_per_hari)
#  [PASS] GET /api/v1/admin/doctor-schedules?search=... returns matching doctor
#
# === 3. Testing GET /api/v1/admin/doctor-schedules/:practitionerId (Monthly & 24h Grid) ===
#  [PASS] GET /api/v1/admin/doctor-schedules/:id succeeds (200 OK)
#  [PASS] Detail has monthly_schedule matrix with 30 days for September
#  [PASS] Day cells have day, date, status, notes
#  [PASS] Detail has sesi_harian array
#  [PASS] GET with non-existent UUID -> 404 Not Found
#
# === 4. Testing PUT /api/v1/admin/doctor-schedules/:practitionerId (Cuti Mutation & Persistence) ===
#  [PASS] PUT /api/v1/admin/doctor-schedules/:id succeeds
#  [PASS] PostgreSQL direct query verifies is_leave=t in Docker database
#  [PASS] Revert Cuti succeeds and resets is_cuti to false
#
# === 5. Testing PATCH /api/v1/admin/doctor-schedules/:practitionerId/day-status ===
#  [PASS] PATCH /day-status succeeds (200 OK)
#  [PASS] PostgreSQL verifies day-status persisted as LEAVE
#
# === 6. Testing POST /api/v1/admin/doctor-schedules/:practitionerId/sessions ===
#  [PASS] POST session with missing required times -> 422 Unprocessable Entity (Validation Error)
#  [PASS] POST session succeeds (201 Created) and returns UUID
#  [PASS] PostgreSQL verifies session row persisted in database
#  [PASS] POST overlapping session rejected with 409 Conflict
#
# === 7. Testing GET /api/v1/clinical/practitioners (Patient Booking Domain) ===
#  [PASS] GET /api/v1/clinical/practitioners accessible without auth (200 OK)
#  [PASS] Clinical practitioners returns non-empty list
#  [PASS] Patient practitioner card has required fields (id, name, spec, schedule, is_available)
#
# === 8. Operational Stability & Rate Limit Probe ===
#  [PASS] 20 rapid clinical requests handled cleanly without 500 errors
#
# ================================================================================
#  REALITY VERIFICATION SUMMARY
#  Passed: 27, Failed: 0
# ================================================================================
#  ALL CHECKS PASSED: Real system behaves as specified in BE-SCHED-001.
```

---

## 6. Delivery Status & Next Actions

- **Backend Status:** 100% Implemented, Built, Tested, and Synchronized.
- **Contract Maturity:** Complete.
- **Blockers:** 0 Blockers.
- **Verdict:** **READY FOR FRONTEND CONSUMPTION**.
