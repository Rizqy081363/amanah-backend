# API Contract Changelog: Patient Affiliations, Master Occupations & On-Demand Booking Lifecycle

- **Date:** 2026-09-27
- **Contract Version:** 1.4.0
- **Scope:** Patient Module, Schedule Booking Module, Appointment Lifecycle
- **Target Clients:** Flutter Mobile App, Web Frontend, Internal Backoffice

---

## 1. Overview & Business Rationale

Frontend clients previously faced limitations where patient demographic data had to be manually entered, sessions were ambiguous or hardcoded, and appointments lacked multi-patient delegation (e.g., booking for spouse, child, or relatives under one user account).

This changelog introduces:
1. **Master Occupations Catalog (`GET /api/v1/occupations`)**: Database-driven master list of Indonesian occupation types.
2. **On-Demand Patient Affiliations (`/api/v1/patients/affiliations`)**: Allows accounts to manage multiple patient profiles (`self`, `spouse`, `child`, `parent`, `other`) without forced family assumptions.
3. **Shift & Booking Options (`GET /api/v1/schedules/booking-options`)**: Returns the 4 canonical shifts (`DINI_HARI`, `PAGI`, `SIANG`, `MALAM`) dynamically derived from `clinic_schedule_policies` and PostgreSQL enum `staff_shift`, complete with real-time doctor availability and `isDisabled` flags.
4. **Conflict-Free Consultation Slot Allocation**: Replaces hardcoded start times with automated 30-minute incremental slot allocation (`allocateSlotTiming`) that honors `appointments_active_practitioner_slot_unique`.
5. **Patient Multi-Profile Appointment Dashboard (`GET /api/v1/appointments/me`)**: Displays all active and historical appointments for the logged-in user and their affiliated patients.
6. **Reschedule Lifecycle (`GET /:id/reschedule-options`, `POST /:id/reschedule`)**: Atomic, quota-preserving reschedule with slot conflict avoidance.

---

## 2. Canonical Enums & Terminology

### 2.1 Session Names (Single Source of Truth)
- Enum: `['DINI_HARI', 'PAGI', 'SIANG', 'MALAM']`
- Database Shift Enum (`staff_shift`): `['early_morning', 'morning', 'afternoon', 'night']`
- Time Windows (Configured in `clinic_schedule_policies`):
  - `DINI_HARI` (`early_morning`): 00:00:00 - 06:00:00
  - `PAGI` (`morning`): 06:00:00 - 12:00:00
  - `SIANG` (`afternoon`): 12:00:00 - 18:00:00
  - `MALAM` (`night`): 18:00:00 - 24:00:00

### 2.2 Patient Relationship Types
- Enum: `['self', 'spouse', 'child', 'parent', 'sibling', 'other']`

---

## 3. Detailed Endpoint Contracts

### 3.1 `GET /api/v1/occupations`
- **Method:** `GET`
- **Auth:** Public / Bearer Token
- **Description:** Returns the complete master catalog of standard Indonesian occupations for form dropdowns.
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    { "code": "pns_tni_polri", "name": "Pegawai Negeri Sipil / TNI / Polri" },
    { "code": "karyawan_swasta", "name": "Karyawan Swasta" },
    { "code": "wiraswasta", "name": "Wiraswasta / Pengusaha" },
    { "code": "ibu_rumah_tangga", "name": "Ibu Rumah Tangga" },
    { "code": "pelajar_mahasiswa", "name": "Pelajar / Mahasiswa" },
    { "code": "guru_dosen", "name": "Guru / Dosen" },
    { "code": "tenaga_medis", "name": "Tenaga Medis / Kesehatan" },
    { "code": "petani_peternak", "name": "Petani / Peternak" },
    { "code": "nelayan", "name": "Nelayan" },
    { "code": "buruh", "name": "Buruh Harian Lepas" },
    { "code": "pensiunan", "name": "Pensiunan" },
    { "code": "belum_bekerja", "name": "Belum / Tidak Bekerja" },
    { "code": "lainnya", "name": "Lainnya" }
  ]
}
```

---

### 3.2 `GET /api/v1/patients/affiliations/me`
- **Method:** `GET`
- **Auth:** Bearer Token (PATIENT / STAF / ADMIN)
- **Description:** Returns all patient profiles affiliated with the authenticated user account.
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "patientId": "uuid",
      "relationshipType": "self",
      "isPrimary": true,
      "patient": {
        "id": "uuid",
        "fullName": "Ahmadamikom Zikri",
        "medicalRecordNumber": "RM-AMIKOM-001",
        "gender": "male",
        "bloodType": "B",
        "occupation": "karyawan_swasta"
      }
    }
  ]
}
```

---

### 3.3 `POST /api/v1/patients/affiliations`
- **Method:** `POST`
- **Auth:** Bearer Token
- **Description:** Creates and links a patient profile to the user's account. Supports on-demand patient registration with demographics or linking existing patient ID.
- **Request Body:**
```json
{
  "relationship_type": "spouse",
  "full_name": "Dewi Lestari",
  "nik": "3201417611100868",
  "mother_name": "Siti Rahma",
  "birth_place": "Bandung",
  "birth_date": "1995-05-15",
  "gender": "female",
  "blood_type": "O",
  "province": "Jawa Barat",
  "city": "Bogor",
  "district": "Cibinong",
  "subdistrict": "Tengah",
  "address_detail": "Jl. Melati No. 12",
  "occupation": "ibu_rumah_tangga"
}
```
- **Response `201 Created`:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "patientId": "uuid",
    "relationshipType": "spouse",
    "isPrimary": false,
    "patient": {
      "id": "uuid",
      "fullName": "Dewi Lestari",
      "medicalRecordNumber": "RM-202609-0012"
    }
  }
}
```

---

### 3.4 `DELETE /api/v1/patients/affiliations/:patientId`
- **Method:** `DELETE`
- **Auth:** Bearer Token
- **Description:** Removes non-primary affiliation. Primary (`isPrimary: true`) cannot be removed.
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Hubungan relasi pasien berhasil dihapus."
}
```

---

### 3.5 `GET /api/v1/schedules/booking-options`
- **Method:** `GET`
- **Query Params:**
  - `date`: `YYYY-MM-DD` (Required)
  - `poliklinikId`: `uuid` (Optional)
  - `staffId`: `uuid` (Optional)
- **Description:** Returns the 4 canonical shift options with real-time capacity and `isDisabled` flags.
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "date": "2026-09-28",
    "dayOfWeek": 1,
    "dayName": "Senin",
    "poliklinikId": "uuid",
    "poliklinikName": "Poli Umum",
    "estimatedDurationMinutes": 30,
    "sessions": [
      {
        "session": "DINI_HARI",
        "shift": "early_morning",
        "label": "Shift Dini Hari",
        "startTime": "00:00:00",
        "endTime": "06:00:00",
        "capacity": 36,
        "availableSlots": 36,
        "bookedSlots": 0,
        "isDisabled": false,
        "disabledReason": null,
        "practitioners": []
      },
      {
        "session": "PAGI",
        "shift": "morning",
        "label": "Shift Pagi",
        "startTime": "06:00:00",
        "endTime": "12:00:00",
        "capacity": 24,
        "availableSlots": 23,
        "bookedSlots": 1,
        "isDisabled": false,
        "disabledReason": null,
        "practitioners": [
          {
            "id": "uuid",
            "staffProfileId": "uuid",
            "sessionId": "uuid",
            "name": "dr. Ahmad Santoso",
            "avatarUrl": null,
            "specialty": "Dokter Umum",
            "roomName": "Ruang Konsultasi 1",
            "startTime": "06:00:00",
            "endTime": "12:00:00"
          }
        ]
      }
    ]
  }
}
```

---

### 3.6 `GET /api/v1/appointments/me`
- **Method:** `GET`
- **Auth:** Bearer Token
- **Description:** Returns all appointments for the current user and their affiliated family/patient profiles.
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "patientId": "uuid",
      "patientName": "Dewi Lestari",
      "poliklinikName": "Poli Umum",
      "doctorName": "dr. Ahmad Santoso",
      "appointmentDate": "2026-09-28",
      "scheduledStartTime": "06:30:00",
      "scheduledEndTime": "07:00:00",
      "estimatedDurationMinutes": 30,
      "session": "PAGI",
      "queueNumber": "P-005",
      "status": "SUDAH_BUAT_JANJI"
    }
  ]
}
```

---

### 3.7 `GET /api/v1/appointments/:id/reschedule-options`
- **Method:** `GET`
- **Auth:** Bearer Token
- **Description:** Retrieves open available dates and shifts for the assigned practitioner to reschedule the appointment.

---

### 3.8 `POST /api/v1/appointments/:id/reschedule`
- **Method:** `POST`
- **Auth:** Bearer Token
- **Request Body:**
```json
{
  "target_session_id": "uuid",
  "target_date": "2026-09-28",
  "reason": "Penyesuaian jadwal kontrol keluarga"
}
```
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "appointmentDate": "2026-09-28",
    "scheduledStartTime": "06:30:00",
    "scheduledEndTime": "07:00:00",
    "status": "SUDAH_BUAT_JANJI"
  }
}
```

---

## 4. Verification & Testing

- Automated E2E test script `scripts/e2e/test-patient-affiliations-and-booking.ps1` passed 10/10 steps.
- Existing regression test `scripts/e2e/test-e2e-ahmad-amikom.ps1` passed 8/8 steps.
- Unit test suites for appointments, patients, and schedule booking passed 38/38 tests.
- Biome linting and formatting checked clean.
- All modified and new files strictly adhere to `< 500 LOC`.
