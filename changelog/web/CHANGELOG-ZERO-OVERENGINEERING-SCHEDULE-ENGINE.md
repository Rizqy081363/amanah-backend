# CHANGELOG: Zero-Overengineering Schedule Engine Contract Specification

**Document Version:** 1.0.0 (Archival / New Edition)  
**Effective Date:** 24 September 2026  
**Audience:** Web Frontend (Admin Next.js) & Mobile Flutter Teams  
**Status:** Canonical Backend Contract  
**Related Endpoints:**
- `GET /api/v1/admin/doctor-schedules` (Card list showcase)
- `GET /api/v1/admin/doctor-schedules/:id?date=YYYY-MM-DD` (24H detail sheet, hourly timeline intervals, 4 shifts, calendar)

---

## 1. Executive Summary & Root Cause Fix

### Root Cause Analysis
Sebelumnya, pada file backend `schedule-slot-state.resolver.ts`, seluruh slot dengan status waktu lampau (`temporalState === 'PAST'`) secara keliru dipaksa menjadi `effectiveStatus = 'EXPIRED'`. Hal ini menyebabkan slot-slot yang **tidak pernah dijadwalkan oleh dokter** (seperti shift Dini Hari 00:00 - 06:00 pada dokter yang hanya praktik Pagi & Siang) terkirim sebagai `'EXPIRED'`. Akibatnya:
- Frontend merender slot Dini Hari sebagai kotak solid abu-abu berlabel **"Selesai"** (sama persis dengan shift yang ada dokternya).
- Di layar user, hanya shift Malam (12 slot) yang tampak bergaris putus-putus "Belum Terjadwal".
- Namun header di atas menampilkan *"24 slot belum dijadwalkan"*, memicu kebingungan visual dan memaksa tim Frontend membuat logika pertahanan berantai (*defensive over-engineering*).

### Solusi Tuntas Backend
1. **Perbaikan State Resolution:** Slot dengan ketersediaan `UNSCHEDULED` di masa lampau **TETAP** berstatus `UNSCHEDULED` (tidak diubah menjadi `EXPIRED`).
2. **Kontrak Siap Pasang (*Plug & Play*):** Backend kini menyuplai seluruh properti visual (`uiStatus`, `uiLabel`, `uiSubLabel`, `uiVariant`, `isClickable`, `actionType`) langsung di setiap slot.
3. **Shift Operational Label:** Header shift kini secara otomatis menyuplai `operationalStatus: 'NO_PRACTICE'` dan `operationalLabel: 'Tidak Ada Praktik'` jika tidak ada jadwal dokter, menggantikan teks membingungkan `"0 slot tersedia"`.
4. **Kalender Bulanan Kanonikal:** Array `monthly_schedule` menyuplai `dayStatus`, `statusLabel`, dan `badgeVariant` secara langsung tanpa membutuhkan fungsi heuristik di Frontend.

---

## 2. Kamus Atribut Visual Slot UI-Ready (Plug & Play)

Frontend **tidak perlu lagi menulis percabangan `if-else`** untuk menentukan warna, label, atau klik tombol. Seluruhnya diatur oleh kamus berikut:

| Kondisi Bisnis Nyata | `uiStatus` | `uiLabel` | `uiSubLabel` | `uiVariant` | `isClickable` | `actionType` | Keterangan Tampilan |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **Tidak ada sesi dokter (Masa Lalu)** | `UNSCHEDULED_PAST` | `"Belum Terjadwal"` | Jam selesai (mis: `"00:30"`) | `neutral_disabled` | `false` | `NONE` | Abu-abu redup / disabled |
| **Tidak ada sesi dokter (Masa Datang)** | `UNSCHEDULED` | `"Belum Terjadwal"` | Jam selesai (mis: `"18:30"`) | `dashed_border` | `true` | `ADD_SESSION` | Border putus-putus abu-abu |
| **Sesi dokter selesai (Masa Lalu)** | `COMPLETED` | `"Selesai"` (atau `"Selesai: Nama"`) | Jam selesai | `muted_gray` | `true` | `VIEW_SESSION` | Abu-abu solid, riwayat sesi |
| **Sesi buka, belum ada pasien** | `AVAILABLE` | `"Tersedia"` | Jam selesai | `success_green` | `true` | `VIEW_SESSION` | Hijau emerald, siap dibooking |
| **Terisi pasien aktif** | `OCCUPIED` | `"Terisi: Nama Pasien"` | Jam selesai | `info_blue` | `true` | `VIEW_PATIENTS` | Biru solid, ada pasien |
| **Sesi hasil Reschedule (Aktif)** | `RESCHEDULED` | `"Dijadwalkan Ulang"` | Jam selesai | `warning_amber` | `true` | `VIEW_SESSION` | Oranye/amber, riwayat pergeseran |
| **Ditutup Cuti Dokter** | `CLOSED_LEAVE` | `"Cuti"` | Jam selesai | `sky_badge` | `false` | `NONE` | Biru muda/sky badge |
| **Ditutup Rapat / Klinik** | `CLOSED_CLINIC` | `"Ditutup: [Alasan]"` | Jam selesai | `danger_red` | `true` | `VIEW_SESSION` | Merah rose, penutupan administratif |

---

## 3. Schema JSON Payload Baru

### A. Item Slot pada `timeline_intervals` & `shifts[].slots`
```json
{
  "slotId": "morning:08:00-08:30",
  "intervalId": "morning:08:00-08:30",
  "slotIndex": 5,
  "timeStart": "08:00",
  "timeEnd": "08:30",
  "startTime": "08:00",
  "endTime": "08:30",
  "timeRange": "08:00 - 08:30 WIB",

  /* --- ATRIBUT SIAP PASANG (ZERO OVER-ENGINEERING) --- */
  "uiStatus": "AVAILABLE",
  "uiLabel": "Tersedia",
  "uiSubLabel": "08:30",
  "uiVariant": "success_green",
  "isClickable": true,
  "actionType": "VIEW_SESSION",
  "sessionId": "47ceb840-39cb-4002-8fa6-bfcf57e443b9",

  /* --- METADATA MODAL DETAIL --- */
  "patientInfo": null,
  "rescheduleInfo": null,
  "closureInfo": null,

  /* --- FACT PRIMITIVES (UNTUK AUDIT) --- */
  "temporalState": "FUTURE",
  "availabilityState": "AVAILABLE",
  "effectiveStatus": "AVAILABLE",
  "isSelectable": true
}
```

### B. Shift Header Summary (`shifts[]`)
```json
{
  "shiftId": "early_morning",
  "shiftName": "Dini Hari",
  "timeRange": "00:00 - 06:00 WIB",
  "boundaryStartTime": "00:00",
  "boundaryEndTime": "06:00",
  "intervalMinutes": 30,

  /* Status operasional shift */
  "operationalStatus": "NO_PRACTICE",
  "operationalLabel": "Tidak Ada Praktik",
  "activeSessionsCount": 0,
  "registeredPatientsCount": 0,
  "availableSlotsCount": 0,
  "totalShiftSlots": 12,

  "metrics": {
    "totalSlots": 12,
    "scheduledSlots": 0,
    "unscheduledSlots": 12,
    "availableSlots": 0,
    "completedSlots": 0,
    "occupiedSlots": 0,
    "closedSlots": 0,
    "activeBookableSlots": 0,
    "scheduleCoverage": {
      "scheduled": 0,
      "total": 12,
      "percentage": 0.0,
      "displayText": "Cakupan Jadwal: 0/12 Slot (0%)"
    },
    "patientOccupancy": {
      "occupied": 0,
      "capacity": 0,
      "percentage": 0.0,
      "displayText": "Okupansi Pasien: 0/0 Slot (0%)"
    },
    "unscheduledNotice": "12 slot belum dijadwalkan"
  }
}
```

### C. Whole Day Summary & Dual Indicators (`data.summary`)
```json
"summary": {
  "totalDaySlots": 48,
  "scheduledSlots": 24,
  "unscheduledSlots": 24,
  "availableSlots": 24,
  "completedSlots": 22,
  "occupiedSlots": 0,
  "closedSlots": 0,
  "activeBookableSlots": 24,
  "scheduleCoverage": {
    "scheduled": 24,
    "total": 48,
    "percentage": 50.0,
    "displayText": "Cakupan Jadwal: 24/48 Slot (50%)"
  },
  "patientOccupancy": {
    "occupied": 0,
    "capacity": 24,
    "percentage": 0.0,
    "displayText": "Okupansi Pasien: 0/24 Slot (0%)"
  },
  "unscheduledNotice": "24 slot belum dijadwalkan"
}
```

### D. Kalender Bulanan (`monthly_schedule[]`)
```json
{
  "day": 24,
  "date": "2026-09-24",
  "dayStatus": "OPEN",
  "statusLabel": "Buka",
  "badgeVariant": "success",
  "activeSessions": 2,
  "totalCapacity": 24,
  "bookedPatients": 0,
  "isClickable": true
}
```
*Catatan Nilai `dayStatus` & `badgeVariant`:*
- `"OPEN"` / `"Buka"` -> `badgeVariant: "success"`
- `"CLOSED"` / `"Tutup"` -> `badgeVariant: "danger"`
- `"CUTI"` / `"Cuti"` -> `badgeVariant: "warning"`
- `"EMPTY"` / `"Kosong"` -> `badgeVariant: "neutral"`

---

## 4. Panduan Implementasi Frontend (Contoh Kode React/Next.js)

Dengan kontrak baru ini, komponen React di Frontend disederhanakan menjadi **murni declarative binding**:

```tsx
import React from 'react';

// Variasi styling langsung dari uiVariant backend
const VARIANT_CLASS_MAP: Record<string, string> = {
  neutral_disabled: 'bg-neutral-100 border-neutral-200 text-neutral-400 opacity-60 cursor-not-allowed',
  dashed_border:    'bg-transparent border-dashed border-neutral-300 text-neutral-600 hover:border-primary-400',
  muted_gray:       'bg-neutral-200 border-neutral-300 text-neutral-700 cursor-pointer',
  success_green:    'bg-emerald-50 border-emerald-400 text-emerald-800 hover:bg-emerald-100 cursor-pointer',
  info_blue:        'bg-blue-50 border-blue-400 text-blue-800 hover:bg-blue-100 cursor-pointer',
  warning_amber:    'bg-amber-50 border-amber-400 text-amber-800 hover:bg-amber-100 cursor-pointer',
  sky_badge:        'bg-sky-50 border-sky-400 text-sky-800 cursor-not-allowed',
  danger_red:       'bg-rose-50 border-rose-400 text-rose-800 hover:bg-rose-100 cursor-pointer',
};

export const SlotItem: React.FC<{ slot: any; onAction: (slot: any) => void }> = ({ slot, onAction }) => {
  return (
    <div
      className={`p-3 rounded-lg border flex flex-col justify-between transition-all ${VARIANT_CLASS_MAP[slot.uiVariant] || ''}`}
      onClick={() => slot.isClickable && onAction(slot)}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{slot.timeRange}</span>
        {slot.uiStatus === 'RESCHEDULED' && <span>🔄</span>}
      </div>
      <div className="mt-2 text-sm font-bold truncate">
        {slot.uiLabel}
      </div>
    </div>
  );
};
```
> **Keuntungan Tim Frontend:**
> - Nol `if-else` bertingkat untuk menghitung waktu lampau vs sekarang.
> - Nol komputasi status cuti vs rapat di browser client.
> - Header summary dan grid slot **100% sinkron secara visual dan matematika**.

---

## 5. Bukti Pengujian Live (*Verified Live Outputs*)

### A. Kasus Dokter Bdn. Laras Wulandari (Hanya Buka Pagi & Siang)
- **Kondisi:** Shift Dini Hari (00:00 - 06:00) & Malam (18:00 - 24:00) **tidak pernah dijadwalkan**.
- **Hasil Live API:**
  - Shift Dini Hari: `operationalStatus: "NO_PRACTICE"`, `operationalLabel: "Tidak Ada Praktik"`. Slot 00:00-06:00 berstatus `uiStatus: "UNSCHEDULED_PAST"`, `uiLabel: "Belum Terjadwal"`, `uiVariant: "neutral_disabled"`.
  - Shift Pagi: `operationalStatus: "ACTIVE"`, `operationalLabel: "12 slot tersedia"`. Slot 06:00-12:00 yang lewat berstatus `uiStatus: "COMPLETED"`, `uiLabel: "Selesai"`, `uiVariant: "muted_gray"`.
  - Shift Siang: `operationalStatus: "ACTIVE"`, `operationalLabel: "12 slot tersedia"`.
  - Shift Malam: `operationalStatus: "NO_PRACTICE"`, `operationalLabel: "Tidak Ada Praktik"`. Slot 18:00-24:00 berstatus `uiStatus: "UNSCHEDULED"`, `uiLabel: "Belum Terjadwal"`, `uiVariant: "dashed_border"`.
  - **Sinkronisasi Visual:** Dini Hari (12 slot "Belum Terjadwal") + Malam (12 slot "Belum Terjadwal") = 24 slot berlabel "Belum Terjadwal". Header: *"24 slot belum dijadwalkan"*. **100% Cocok!**

### B. Kasus Dokter Ahmadamikom Zikri (Buka Dini Hari & Pagi, 1 Slot Rapat Komite)
- **Kondisi:** Shift Dini Hari (12 slot) dan Pagi (12 slot) dibuka. Slot 11:00-11:30 ditutup untuk Rapat Koordinasi Komite Medik.
- **Hasil Live API:**
  - Slot 11:00-11:30: `uiStatus: "CLOSED_CLINIC"`, `uiLabel: "Ditutup: Rapat Koordinasi Komite Medik"`, `uiVariant: "danger_red"`, `actionType: "VIEW_SESSION"`.
  - Slot 09:00-09:30: Reschedule aktif seminar -> `rescheduleInfo: { sourceDate: "2026-09-23 14:00", reasonText: "Permohonan reschedule dokter karena seminar" }`.
  - Kapasitas Aktif Pasien: 23 slot (`occupancy.displayText: "Okupansi Pasien: 0/23 Slot (0%)"`).
  - Cakupan Jadwal Dokter: 24/48 slot (`scheduleCoverage.displayText: "Cakupan Jadwal: 24/48 Slot (50%)"`).
