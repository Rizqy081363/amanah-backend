# Official Backend Contract: Doctor Schedule Showcase Card & Closed Day Semantics

## Target Audience: Web Frontend Engineering Team
**Module:** Clinical & Admin Doctor Schedules (`/api/v1/admin/doctor-schedules`, `/api/v1/admin/doctor-schedules/:id`)  
**Specification Version:** `2026.09.24`  
**Document Classification:** Pure HTTP REST API Contract & State Machine (Strictly Backend-Driven, Zero Client Business Logic)

---

## 1. Executive Summary & Root Cause Analysis

Previously, frontend showcase cards exhibited visual and semantic discrepancies where a practitioner displayed a `Tutup` badge while simultaneously rendering `2 / 2` occupancy slots and upcoming session details (`Pagi (06:00 - 06:30) - Selesai`).

This was caused by two separate anti-patterns:
1. **Frontend Client-Side Calculation:** The frontend card component performed client-side arithmetic via `.reduce()` across session arrays, computing occupancy independently instead of consuming backend-projected values.
2. **Backend Closed State Zeroing:** When all sessions for a day were closed or cancelled, the backend aggregate status correctly returned `Tutup`, but residual slot capacity had not been zeroed out in the legacy card serializer.

### Architectural Principle
> **The Backend is the Single Source of Truth (SSOT) for all business logic, capacity math, and state resolution.**
> The Frontend is purely a presentation consumer. The frontend MUST NOT perform `.reduce()` or arithmetic on session quotas to determine card metrics.

---

## 2. Canonical Status Model vs Display Localization

The backend persists and evaluates statuses using canonical domain types. Indonesian strings are provided strictly as formatted display labels.

### Schedule Operational Status Machine

| Domain Operational Status | Display Value (`status_dokter`, `status_sesi`) | Definition | How State is Transitioned |
| :--- | :--- | :--- | :--- |
| **`OPEN`** | `"Buka"` | The session/day is active and has at least 1 slot remaining. | Configured by doctor/admin, or restored via reschedule. |
| **`OCCUPIED`** | `"Terisi"` | The session/day is active, but remaining slots = 0 (`available_slots == 0`). | **System-derived only**. A doctor or admin cannot manually select "Terisi"; it is automatically computed when bookings reach capacity. |
| **`CLOSED`** | `"Tutup"` | The session/day is closed for operational reasons, day off, or leave. | Manually toggled via switcher (`Buka` <-> `Tutup`), or triggered by practitioner leave. |

> **Note on `CUTI` / `LEAVE`:**  
> `CUTI` is not an operational schedule status—it is an absence period governed by `practitioner_leave_periods` and `is_leave: true`. When a doctor is on leave, their operational status resolves to **`CLOSED`** (`"Tutup"`), with `is_cuti: true` and `cuti_reason: "..."`.

---

## 3. Strict Contract Specification: `GET /api/v1/admin/doctor-schedules`

### Endpoint Details
* **Method:** `GET`
* **Path:** `/api/v1/admin/doctor-schedules`
* **Query Parameters:**
  * `date` (format: `YYYY-MM-DD`, optional, default: today)
  * `page` (number, optional, default: `1`)
  * `limit` (number, optional, default: `6`)
  * `search` (string, optional, searches doctor name, unit, room)
  * `poli` (string, optional, filters polyclinic)
  * `status` (string, optional: `buka`, `terisi`, `tutup`, comma-separated)

---

### Case A: Doctor is Closed (`status_dokter: "Tutup"`)

When a doctor has no open sessions, is closed by admin, or is on leave:
* `slot_tersedia` is **guaranteed to be `0`**.
* `kapasitas_per_hari` is **guaranteed to be `0`**.
* `slot_terisi_akumulasi` is **guaranteed to be `0`**.
* `slot_kapasitas_akumulasi` is **guaranteed to be `0`**.
* `display_akumulasi_slot` is **guaranteed to be `"-"`**.
* `jadwal_hari_ini` is **guaranteed to be `"-"`**.
* `jadwal_praktik_mendatang` is:
  * `"Cuti Dokter"` if `is_cuti === true`
  * `"Praktik Ditutup"` if sessions exist but are closed
  * `"Tidak Ada Jadwal"` if no sessions are configured for the date

#### Example JSON Response
```json
{
  "id": "c518facb-372e-4f07-9766-f3eacf54221f",
  "practitioner_id": "c518facb-372e-4f07-9766-f3eacf54221f",
  "nama_dokter": "dr. Ahmadamikom Zikri",
  "spesialisasi": "Poli Umum",
  "status_dokter": "Tutup",
  "status_jadwal": "Tutup",
  "email": "doctor@amanah.test",
  "nomor_telepon": "081234567890",
  "ruang_praktik": "Ruang Poli 1",
  "tanggal_praktik": "Rabu, 24 Sep 2026",
  "avatar": "",
  "slot_tersedia": 0,
  "kapasitas_per_hari": 0,
  "jadwal_hari_ini": "-",
  "jadwal_praktik_mendatang": "Praktik Ditutup",
  "slot_terisi_akumulasi": 0,
  "slot_kapasitas_akumulasi": 0,
  "display_akumulasi_slot": "-",
  "bulan_jadwal": "September 2026",
  "is_cuti": false,
  "cuti_reason": null,
  "cuti_start": null,
  "cuti_end": null,
  "sesi_harian": [
    {
      "id": "8489be4c-7c05-4c07-b352-7bf579b29cb1",
      "nama_sesi": "Sesi Pagi",
      "jam_mulai": "06:00",
      "jam_selesai": "06:30",
      "waktu": "06:00 - 06:30",
      "kuota_pasien": 2,
      "slot_tersedia": 0,
      "status_sesi": "Tutup",
      "ruang": "Ruang Poli 1",
      "is_reschedule_eligible": false,
      "reschedule_ineligibility_reason": "Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi."
    }
  ]
}
```

---

### Case B: Doctor is Open (`status_dokter: "Buka"`)

When a doctor has available slots:

#### Example JSON Response
```json
{
  "id": "e0d4d8c5-412d-4915-8b4c-b06b9d84ac65",
  "practitioner_id": "e0d4d8c5-412d-4915-8b4c-b06b9d84ac65",
  "nama_dokter": "dr. Ahmad Santoso",
  "spesialisasi": "Poli Umum",
  "status_dokter": "Buka",
  "status_jadwal": "Buka",
  "email": "ahmad.santoso@amanah.test",
  "nomor_telepon": "081298765432",
  "ruang_praktik": "Ruang Poli 1",
  "tanggal_praktik": "Rabu, 24 Sep 2026",
  "avatar": "/api/v1/avatar/doctor-1",
  "slot_tersedia": 10,
  "kapasitas_per_hari": 12,
  "jadwal_hari_ini": "08:00 - 11:30",
  "jadwal_praktik_mendatang": "Pagi (08:00 - 11:30) - Sedang Berlangsung",
  "slot_terisi_akumulasi": 2,
  "slot_kapasitas_akumulasi": 12,
  "display_akumulasi_slot": "2 / 12",
  "bulan_jadwal": "September 2026",
  "is_cuti": false,
  "cuti_reason": null,
  "cuti_start": null,
  "cuti_end": null,
  "sesi_harian": [
    {
      "id": "e4b2d189-9a71-46f9-8d77-628a8d11e5a1",
      "nama_sesi": "Sesi Pagi",
      "jam_mulai": "08:00",
      "jam_selesai": "11:30",
      "waktu": "08:00 - 11:30",
      "kuota_pasien": 12,
      "slot_tersedia": 10,
      "status_sesi": "Buka",
      "ruang": "Ruang Poli 1",
      "is_reschedule_eligible": true,
      "reschedule_ineligibility_reason": null
    }
  ]
}
```

---

### Case C: Doctor is Fully Booked (`status_dokter: "Terisi"`)

When a doctor has open sessions, but all slots are booked:
* `slot_tersedia`: `0`
* `kapasitas_per_hari`: `12`
* `slot_terisi_akumulasi`: `12`
* `slot_kapasitas_akumulasi`: `12`
* `display_akumulasi_slot`: `"12 / 12"`
* `jadwal_hari_ini`: `"08:00 - 11:30"`
* `jadwal_praktik_mendatang`: `"Pagi (08:00 - 11:30)"`

---

## 4. Frontend Mandatory Consumption Rules

1. **NO Client-Side Arithmetic:**
   - Do NOT run `sesi_harian.reduce((acc, s) => acc + s.slot_tersedia, 0)` on the frontend.
   - Do NOT calculate percentage quotas on the client side.
   - Consume `display_akumulasi_slot`, `slot_tersedia`, `kapasitas_per_hari`, and `jadwal_hari_ini` directly.

2. **Conditional Rendering on Showcase Card:**
   - Check `status_dokter === 'Tutup'` or `status_dokter === 'Closed'`.
   - When status is `Tutup`:
     - Render the closed / inactive state notice banner (e.g. displaying `jadwal_praktik_mendatang` which will indicate `"Praktik Ditutup"` or `"Cuti Dokter"`).
     - **Do NOT render the active quota stats block** (e.g. `<DoctorScheduleStats>`). Closed schedules do not have active quotas.

3. **Status Filter Compatibility:**
   - When filtering by status on `GET /api/v1/admin/doctor-schedules?status=...`, the backend accepts both English canonical keys (`open`, `occupied`, `closed`) and localized labels (`buka`, `terisi`, `tutup`).
