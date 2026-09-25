# API Contract Changelog: Zero-Client-Calculation Architecture, Form Bootstrap & SSOT Anti-Collision Slot Availability

- **Changelog ID**: `CHG-20260925-SCHED-003`
- **Date**: 2026-09-25
- **Author**: Backend Core Architecture Team
- **Type**: Non-breaking Additive Enhancement & Architectural Delegation
- **Target Audience**: Flutter Mobile Team (`amanah-healthcare-mobile`), Web-Admin Frontend Team, Backend Integration Engineers
- **Status**: Production-Ready & Deployed (Docker API Container Healthy)

---

## 1. Executive Summary & Problem Background

Prior to this update, client applications (particularly the Flutter mobile app) performed heavy scheduling and collision calculations locally:
1. **Client Overengineering (364 LOC in Flutter)**: The mobile client maintained a dedicated helper (`ScheduleSlotCollisionHelper`) calculating 30-minute intervals, loop iterations, past-time boundaries, and room collision state.
2. **Blind Room Fallback Defect**: If a doctor had not chosen a room yet or room data arrived asynchronously, the UI fell back blindly to `_rooms.first.id` (e.g. `Ruang KIA 1`). When the doctor submitted a schedule for `Ruang Poli Umum 1`, a `409 Conflict` error occurred.
3. **Desynchronized Grids (Non-WYSIWYG)**: Slot grids displayed slots as empty because client logic was unaware of schedules belonging to other doctors in that room, leading to submission failures.
4. **Network Chatter**: Opening the schedule form triggered 4 separate HTTP calls (`/reference/options`, `/reference/rooms`, `/reference/polikliniks`, `/contexts`).

### Architectural Solution: Backend Delegation
The backend now implements the **Two-Endpoint Backend Delegation Architecture**:
1. `GET /api/v1/schedules/form-bootstrap`: Consolidates 4 requests into **1 single roundtrip**, providing doctor preferences, default room/poli, room occupancies, and 4 canonical shifts.
2. `GET /api/v1/schedules/slot-availability`: Delivers a **presentation-ready (WYSIWYG) 12-slot grid** with pre-calculated availability, display labels, and conflict priority resolution. Frontend acts purely as a dumb renderer.

---

## 2. Changes Matrix

| Dimension | Previous Client-Side State | New Backend Delegation Contract | Breaking? | Affected Clients |
|---|---|---|---|---|
| **Form Bootstrap** | 4 parallel HTTP calls (`/options`, `/rooms`, `/polikliniks`, `/contexts`) | `GET /api/v1/schedules/form-bootstrap?date=YYYY-MM-DD` (1 roundtrip) | No (Additive) | Mobile, Web-Admin |
| **Room Selection** | Blind fallback to `_rooms.first.id` (`Ruang KIA 1`) | Pre-populated `doctor.defaultRoomId` and `defaultPoliklinikId` | No | Mobile, Web-Admin |
| **Collision Logic** | 364 LOC in Flutter (`ScheduleSlotCollisionHelper`) | `GET /api/v1/schedules/slot-availability` (100% backend SSOT) | No (Additive) | Mobile, Web-Admin |
| **Slot Resolution** | Client guessed status from partial data | Deterministic 5-tier priority resolution: `PAST` > `LEAVE` > `OCCUPIED_BY_SELF` > `OCCUPIED_BY_OTHER` > `AVAILABLE` | No | Mobile, Web-Admin |
| **Legacy Endpoints** | Existing endpoints intact | Fully preserved for backward compatibility | No | All |

---

## 3. Detailed Endpoint Contracts

### 3.1. Form Bootstrap Endpoint
Consolidates all form context and references into a single call when opening the Add/Edit Schedule modal.

- **Method**: `GET`
- **Path**: `/api/v1/schedules/form-bootstrap`
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `date` (`string`, required): Format `YYYY-MM-DD` (e.g. `2026-09-25`).
  - `scheduleId` (`string`, optional): UUID of schedule if opened in Edit mode.

#### Response Body (`200 OK`)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Form bootstrap data successfully retrieved",
  "data": {
    "doctor": {
      "id": "c518facb-372e-4f07-9766-f3eacf54221f",
      "name": "dr. Ahmadamikom Zikri",
      "defaultRoomId": "b77d141b-2fa5-4481-9f47-a5a040faf57a",
      "defaultRoomName": "Ruang Poli Umum 1",
      "defaultPoliklinikId": "53fa8088-46c8-4611-9dea-99a54f4a45ab",
      "defaultPoliklinikName": "Poli Umum",
      "consultationDurationMinutes": 30
    },
    "rooms": [
      {
        "id": "b77d141b-2fa5-4481-9f47-a5a040faf57a",
        "name": "Ruang Poli Umum 1",
        "code": "RPU-01",
        "isOccupied": true,
        "occupiedBy": "dr. Ahmadamikom Zikri"
      },
      {
        "id": "590be133-107b-476e-bab3-a3ccd2d875dd",
        "name": "Ruang KIA 1",
        "code": "KIA-01",
        "isOccupied": false,
        "occupiedBy": null
      }
    ],
    "polikliniks": [
      {
        "id": "53fa8088-46c8-4611-9dea-99a54f4a45ab",
        "name": "Poli Umum",
        "code": "POLI-UMUM"
      }
    ],
    "shifts": [
      {
        "id": "dini_hari",
        "code": "early_morning",
        "name": "Sesi Dini Hari",
        "startTime": "00:00",
        "endTime": "06:00",
        "isPast": true,
        "existingSchedule": null
      },
      {
        "id": "pagi",
        "code": "morning",
        "name": "Sesi Pagi",
        "startTime": "06:00",
        "endTime": "12:00",
        "isPast": false,
        "existingSchedule": {
          "id": "936833d1-8c2d-4f27-89bd-5f811e833859",
          "startTime": "06:00",
          "endTime": "12:00",
          "status": "OPEN",
          "roomId": "b77d141b-2fa5-4481-9f47-a5a040faf57a",
          "roomName": "Ruang Poli Umum 1"
        }
      },
      {
        "id": "siang",
        "code": "afternoon",
        "name": "Sesi Siang",
        "startTime": "12:00",
        "endTime": "18:00",
        "isPast": false,
        "existingSchedule": null
      },
      {
        "id": "malam",
        "code": "night",
        "name": "Sesi Malam",
        "startTime": "18:00",
        "endTime": "24:00",
        "isPast": false,
        "existingSchedule": null
      }
    ]
  }
}
```

---

### 3.2. Slot Availability Anti-Collision Grid Endpoint
Calculates slot-by-slot availability across a 6-hour shift boundary at 30-minute intervals (12 slots).

- **Method**: `GET`
- **Path**: `/api/v1/schedules/slot-availability`
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `date` (`string`, required): Format `YYYY-MM-DD` (e.g. `2026-09-25`).
  - `shift` (`string`, required): Canonical shift code or ID (`early_morning`, `morning`, `afternoon`, `night`, `dini_hari`, `pagi`, `siang`, `malam`).
  - `roomId` (`string`, required): Room UUID to check occupancy against.
  - `scheduleId` (`string`, optional): Schedule UUID if editing (excludes current schedule from self-collision).

#### Priority Resolution Engine:
1. **Priority 1 (`PAST`)**: If slot is in the past for today (`Asia/Jakarta`). `displayLabel: "Sudah Selesai"`, `isAvailable: false`.
2. **Priority 2 (`CLOSED_LEAVE`)**: If doctor has approved leave (`isCuti === true`) on target date. `displayLabel: "Cuti"`, `isAvailable: false`.
3. **Priority 3 (`OCCUPIED_BY_SELF`)**: If the doctor already has a scheduled session overlapping this slot. `displayLabel: "Jadwal Anda"`, `isAvailable: false`.
4. **Priority 4 (`OCCUPIED_BY_OTHER`)**: If the target room is occupied by another practitioner. `displayLabel: "<Nama Dokter Lain>"`, `isAvailable: false`.
5. **Priority 5 (`AVAILABLE`)**: No conflicts. `displayLabel: "Tersedia"`, `isAvailable: true`.

#### Response Body (`200 OK`)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Slot availability grid successfully retrieved",
  "data": {
    "date": "2026-09-25",
    "shift": "morning",
    "room": {
      "id": "b77d141b-2fa5-4481-9f47-a5a040faf57a",
      "name": "Ruang Poli Umum 1"
    },
    "summary": {
      "totalSlots": 12,
      "availableSlots": 0,
      "occupiedSlots": 12
    },
    "slots": [
      {
        "slotIndex": 0,
        "time": "06:00",
        "endTime": "06:30",
        "isAvailable": false,
        "status": "PAST",
        "displayLabel": "Sudah Selesai",
        "conflict": {
          "type": "TEMPORAL_PAST",
          "occupantName": null,
          "reason": "Slot waktu ini telah melewati jam operasional saat ini."
        }
      },
      {
        "slotIndex": 4,
        "time": "08:00",
        "endTime": "08:30",
        "isAvailable": false,
        "status": "OCCUPIED_BY_OTHER",
        "displayLabel": "dr. Budi Setiawan, Sp.PD",
        "conflict": {
          "type": "ROOM_OCCUPIED",
          "occupantName": "dr. Budi Setiawan, Sp.PD",
          "reason": "Ruang Poli Umum 1 sedang digunakan oleh dr. Budi Setiawan, Sp.PD pada rentang waktu ini."
        }
      },
      {
        "slotIndex": 8,
        "time": "10:00",
        "endTime": "10:30",
        "isAvailable": true,
        "status": "AVAILABLE",
        "displayLabel": "Tersedia",
        "conflict": null
      }
    ]
  }
}
```

---

## 4. Implementation Guidance for Clients

### 4.1. Flutter Mobile Team (`amanah-healthcare-mobile`)

#### Action 1: Deprecate `ScheduleSlotCollisionHelper`
Delete or deprecate the 364 lines of manual collision logic in Flutter. All slot states, boundary validations, and occupant labels are pre-calculated by the backend.

#### Action 2: Simplify Form Open Flow
In `AmanahScheduleFormDrawer` / `AmanahScheduleFormState`:
```dart
// 1. Fetch bootstrap on drawer open
final bootstrap = await repository.getFormBootstrap(selectedDate);

// 2. Initialize default dropdowns without blind fallbacks
selectedRoomId = bootstrap.doctor.defaultRoomId;
selectedPoliklinikId = bootstrap.doctor.defaultPoliklinikId;

// 3. Fetch slot grid when shift or room changes
Future<void> updateSlotGrid() async {
  final availability = await repository.getSlotAvailability(
    date: selectedDateStr,
    shift: selectedShiftCode,
    roomId: selectedRoomId,
  );
  setState(() {
    slots = availability.slots;
  });
}
```

#### Action 3: Render Slot Grid
Simply render each slot tile from the backend array:
```dart
InkWell(
  onTap: slot.isAvailable ? () => selectSlot(slot) : null,
  child: SlotChip(
    time: slot.time,
    label: slot.displayLabel, // e.g. "Tersedia", "Sudah Selesai", "dr. Ahmad"
    color: slot.isAvailable ? Colors.green : Colors.grey,
    isEnabled: slot.isAvailable,
  ),
);
```

---

### 4.2. Web-Admin Frontend Team

1. **Schedule Modal in Admin Portal**:
   - Call `GET /api/v1/schedules/form-bootstrap?date=YYYY-MM-DD` when launching the "Tambah / Edit Jadwal Dokter" dialog.
   - Use `rooms` array to flag rooms that are already occupied on the target date.
2. **Conflict Prevention in Grid View**:
   - Call `GET /api/v1/schedules/slot-availability?date=YYYY-MM-DD&shift=...&roomId=...`.
   - Any slot with `isAvailable === false` should be disabled with tooltip showing `slot.conflict.reason`.

---

## 5. Verification & Testing Evidence

1. **Unit & Integration Suite**:
   - `drizzle-schedule-bootstrap.spec.ts`: Passed 4 comprehensive test suites covering:
     - `TEMPORAL_PAST` slot marking.
     - `OCCUPIED_BY_OTHER` room conflict detection.
     - `OCCUPIED_BY_SELF` doctor overlap detection.
     - `CLOSED_LEAVE` status marking when doctor is on leave.
   - `schedules.controller.spec.ts`: Passed all 23 unit tests.
   - Full domain & repository suite (`bun test`): **56/56 passed** across 14 files.
2. **Live Docker Verification**:
   - API container `amanah-healthcare-backend-api-1` running healthy on port 3001.
   - Live curl verified `GET /api/v1/schedules/form-bootstrap` returning HTTP 200 with 4 rooms, 4 shifts, and doctor context.
   - Live curl verified `GET /api/v1/schedules/slot-availability` returning 12 slots matching exact priority contract.
3. **API Specification Synchronization**:
   - Auto-generated markdown specification regenerated via `bun run docs:schedules` (`docs/SCHEDULE_MANAGEMENT_API_SPEC.md`), documenting 40 active endpoints including `form-bootstrap` and `slot-availability`.
