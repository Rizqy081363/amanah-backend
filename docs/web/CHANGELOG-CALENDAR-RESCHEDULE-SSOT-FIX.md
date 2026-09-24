# Web Admin — Spesifikasi Resmi & Changelog: Level-1 vs Level-2 SSOT Synchronization on Reschedule & Day Status

**Versi Dokumen:** 1.0.0  
**Target Pembaca:** Tim Frontend Web Admin (Next.js / React) & Mobile Engineering  
**Backend Service:** Amanah Healthcare Backend v1.2.0  
**Referensi:** `# Backend Delegation Report: Calendar Level-1 vs Session Level-2 SSOT Synchronization Failure on Reschedule & Day Status Evaluation`  
**Status Resolusi:** FIXED & VERIFIED IN LIVE CONTAINER  
**Tanggal:** 24 September 2026  

---

## 1. Executive Summary & Pengakuan Analisis

Tim Backend menyampaikan apresiasi penuh atas laporan audit komprehensif dari Tim Frontend (`BACKEND_DELEGATION_REPORT_CALENDAR_RESCHEDULE.md`). Hasil audit frontend diverifikasi **100% akurat** dan mencerminkan dua cacat logika (*defects*) nyata di backend yang menyebabkan ketidaksinkronan antara **Level 1 (Kalender Bulanan)** dan **Level 2 (Sesi Shift & Jam Praktik)**.

Kini, kedua masalah tersebut telah **diperbaiki secara tuntas di core repository, didukung migrasi database otomatis, dan diverifikasi lulus pengujian E2E (117 / 117 passing checks)**.

---

## 2. Invarian Domain & Kontrak Tunggal (Single Source of Truth)

Sistem penjadwalan Amanah Healthcare menetapkan kontrak invarian berikut:

```
Level 1: KALENDER BULANAN (monthly_schedule[*].status)
         └── Binary: "Buka" (Hijau) vs "Tutup" (Abu-abu/Netral) vs "Terisi"
                 ▲
                 │ (Deterministic Aggregation 100% Backend-Owned)
                 │
Level 2: SESI SHIFT PRAKTIK (practitioner_schedule_sessions)
         └── 4 Shift: Dini Hari, Pagi, Siang, Malam
```

### Aturan Agregasi Mutlak Level 1 dari Level 2:
1. **0 Sesi Praktik $\to$ Wajib `"Tutup"`:**
   Jika pada suatu tanggal kalender dokter memiliki **0 sesi praktik aktif** (`daySessions.length === 0`), status kalender tanggal tersebut **MUTLAK `"Tutup"`** (`notes: null`).
   *Tidak ada kondisi apa pun (termasuk riwayat setting hari sebelumnya) yang boleh memaksakan status `"Buka"` pada tanggal tanpa sesi.*
2. **Semua Sesi Tutup / Cuti $\to$ Wajib `"Tutup"`:**
   Jika semua sesi yang ada berstatus `closed` atau `leave` (`anyOpen === false`), status kalender adalah `"Tutup"`.
3. **Minimal 1 Sesi Terbuka $\to$ `"Buka"` (atau `"Terisi"`):**
   - Jika terdapat $\ge 1$ sesi dengan `status === 'open'` dan masih ada kuota slot (`availableSlots > 0`), status kalender adalah **`"Buka"`** (Hijau).
   - Jika terdapat sesi terbuka namun seluruh kapasitas slot telah habis terisi booking pasien (`availableSlots === 0`), status kalender adalah **`"Terisi"`** (Orange).

---

## 3. Rincian Perbaikan Core Backend

### 3.1 Resolusi Bug 1: Eliminasi Flawed Logic pada `findAdminDoctorScheduleDetail`
* **File:** `src/modules/schedules/infrastructure/drizzle/schedule.drizzle-repository.ts`
* **Lokasi:** Baris `2588 - 2599`
* **Koreksi:**
  Logika percabangan yang sebelumnya mengecek `daySetting.leaveReason === 'Buka'` saat `daySessions.length === 0` telah **dihapus seutuhnya**.
  ```typescript
  // SEBELUM (CACAT):
  } else if (daySessions.length === 0) {
    if (daySetting && !daySetting.isLeave && (daySetting.leaveReason === 'Buka' || daySetting.leaveReason === 'open')) {
      dayStatus = 'Buka'; // <--- BUG! 0 sesi dipaksa Buka
      dayNotes = 'Status dibuka oleh admin';
    } else {
      dayStatus = 'Tutup';
    }
  }

  // SESUDAH (DIPERBAIKI & DETERMINISTIK):
  } else if (daySessions.length === 0) {
    dayStatus = 'Tutup';
    dayNotes = null;
  } else {
    const anyOpen = daySessions.some((s) => s.status === 'open');
    if (!anyOpen) {
      dayStatus = 'Tutup';
      dayNotes = daySetting?.leaveReason || 'Jadwal ditutup oleh admin';
    } else {
      const totalAvail = daySessions.reduce(
        (acc, s) => acc + (s.availableSlots ?? s.capacity ?? 8),
        0,
      );
      if (totalAvail === 0) {
        dayStatus = 'Terisi';
        dayNotes = 'Interval terisi oleh pasien reservasi';
      } else {
        dayStatus = 'Buka';
      }
    }
  }
  ```

---

### 3.2 Resolusi Bug 2: Kaskade Otomatis Tanggal Asal & Target pada Mutasi Reschedule
* **File:** `src/modules/schedules/infrastructure/drizzle/schedule.drizzle-repository.ts`
* **Method:** `rescheduleAdminDoctorSession` (di dalam transaksi atomik `tx`)
* **Koreksi:**
  Ketika sesi dipindahkan dari `previousSchedule.date` ke `targetDate`:
  1. Backend menghitung sisa sesi terbuka pada tanggal asal (`previousSchedule.date`).
  2. Jika tidak ada lagi sesi terbuka pada tanggal asal (`remainingOpenOnSource.length === 0`), backend **secara otomatis meng-update `practitionerScheduleDaySettings` pada tanggal asal menjadi `leaveReason = 'Tutup'`**.
  3. Pada tanggal target (`targetDate`), jika sebelumnya tercatat `leaveReason = 'Tutup'`, backend **secara otomatis merestore `leaveReason = 'Buka'`** karena telah menerima sesi baru yang aktif.
  4. Proteksi serupa juga diterapkan pada method `delete` (`DELETE /api/v1/schedules/:id`).

---

### 3.3 Eksekusi Migrasi Database & Pembersihan Data Yatim (*Orphaned Records*)
Backend telah mengeksekusi script pembersihan SQL dan mematenkannya ke dalam file migrasi permanen:
* **File Migrasi:** `src/database/migrations/0009_clean_orphaned_day_settings.sql`
* **Journal:** Terdaftar di `src/database/migrations/meta/_journal.json` (entry idx: 9)
* **SQL Query yang Dijalankan:**
  ```sql
  UPDATE practitioner_schedule_day_settings ds
  SET leave_reason = 'Tutup', updated_at = NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM practitioner_schedule_sessions s
    WHERE s.practitioner_id = ds.practitioner_id
      AND s.schedule_date = ds.schedule_date
      AND s.status = 'open'
  )
  AND ds.is_leave = false
  AND (ds.leave_reason = 'Buka' OR ds.leave_reason = 'open');
  ```
* **Hasil Eksekusi:** 2 baris data yatim (termasuk row tanggal `2026-09-25` untuk dr. Ahmadamikom Zikri `c518facb-372e-4f07-9766-f3eacf54221f`) telah diperbarui ke status `'Tutup'`.

---

## 4. Hasil Verifikasi Live API & Bukti Pengujian

### 4.1 Verifikasi Kasus Riil Dokter Ahmadamikom Zikri (`2026-09-25`):
Setelah perbaikan diterapkan pada API:
* **Request:** `GET /api/v1/admin/doctor-schedules/c518facb-372e-4f07-9766-f3eacf54221f?month=2026-09`
* **Respons Payload untuk Tanggal 25:**
  ```json
  {
    "day": 25,
    "date": "2026-09-25",
    "status": "Tutup",
    "notes": null
  }
  ```
  *(Status tanggal 25 yang sebelumnya cacat "Buka", kini terbukti berubah menjadi `"Tutup"`).*

---

### 4.2 Verifikasi 3 Skenario Acceptance Criteria Frontend:

#### Skenario 1: Reschedule Single Sesi dari Tanggal A ke Tanggal B
* Tanggal A (`2026-10-10`) memiliki 1 sesi. Sesi di-reschedule ke Tanggal B (`2026-10-15`).
* **Hasil Live Test:**
  - `monthly_schedule` Tanggal A (`2026-10-10`): **`status: "Tutup"`** [PASS]
  - `monthly_schedule` Tanggal B (`2026-10-15`): **`status: "Buka"`** [PASS]
  - Detail `date=2026-10-10`: `status_dokter: "Tutup"`, `sesi_harian: []` (0 sesi) [PASS]

#### Skenario 2: Reschedule Parsial (Multi-Sesi)
* Tanggal A memiliki 2 sesi (Pagi dan Sore). Sesi Pagi di-reschedule ke Tanggal B.
* **Hasil Live Test:**
  - Tanggal A masih memiliki sesi Sore terbuka $\to$ Tanggal A tetap **`"Buka"`** [PASS]
  - Tanggal B menerima sesi Pagi terbuka $\to$ Tanggal B menjadi **`"Buka"`** [PASS]

#### Skenario 3: Reschedule Sesi Terakhir yang Tersisa
* Sesi Sore pada Tanggal A kemudian di-reschedule ke Tanggal C.
* **Hasil Live Test:**
  - Tanggal A kini memiliki 0 sesi terbuka $\to$ Tanggal A langsung bertransisi menjadi **`"Tutup"`** [PASS]

---

## 5. Ringkasan Pengujian Sistem (Automated Suite)

| Pengujian | Target | Hasil | Status |
|---|---|---|---|
| Unit Test Controller | `src/modules/schedules/presentation/schedules.controller.spec.ts` | 21 passed / 21 total | **100% PASS** |
| E2E Security & CRUD Suite | `scripts/e2e/test-schedule-v2-security-crud.ps1` | 117 passed / 117 total | **100% PASS** |
| Docker Rebuild Runtime | `amanah-healthcare-backend-api-1` | Container Recreated & Healthy | **OPERATIONAL** |
