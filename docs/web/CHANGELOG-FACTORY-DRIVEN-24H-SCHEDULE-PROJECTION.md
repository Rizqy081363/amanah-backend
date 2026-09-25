# Factory-Driven 24-Hour Schedule Projection & Dynamic DB Intervals Changelog

**Date:** 2026-09-24  
**Audience:** Next.js Web Admin, Flutter Mobile, Backend Engineering  
**Change Type:** Architecture Refactoring, Database Migration, and API Specification  
**Canonical Rule:** Single Source of Truth in Database (`clinic_schedule_policies` & `practitioners.consultation_duration_minutes`) -> Mathematical Pure Factory (`ScheduleSlotFactory`) -> Backend API -> Frontend & Mobile Consumers

---

## 1. Executive Summary

Previously, consultation durations (e.g., 30 minutes), shift time boundaries (ending at 17:00 or 21:00 with gaps), and session slot arrays were partially hardcoded in repositories, seeders, and application constants. Furthermore, selecting a start time like `14:00` erroneously filled the entire afternoon shift (projecting up to `16:00` or `17:00`) because `fillShift` defaulted to `true` when `endTime` was omitted.

This change delivers:
1. **Zero Hardcoding**: All schedule policies, consultation durations, and shift boundaries are persisted in PostgreSQL.
2. **Pure Mathematical Factory**: Domain class `ScheduleSlotFactory` performs all interval, capacity, and boundary arithmetic dynamically.
3. **24-Hour Clinical Cycle**: Four equal 6-hour shifts (360 minutes each):
   - **Dini Hari (`early_morning`)**: `00:00` - `06:00` (Default 12 slots @ 30m)
   - **Pagi (`morning`)**: `06:00` - `12:00` (Default 12 slots @ 30m)
   - **Siang (`afternoon`)**: `12:00` - `18:00` (Default 12 slots @ 30m)
   - **Malam (`night`)**: `18:00` - `24:00` (Default 12 slots @ 30m)
4. **Dynamic Single-Slot Auto-Calculation**: When frontend sends only `startTime` (without `endTime` or `slotsCount`), backend auto-advances exactly **1 consultation duration** from DB (e.g., `14:00` -> `14:30`), leaving the exact remaining shift slots (e.g., `7` slots remaining until `18:00`).
5. **Seeder Integration**: Database seeder `seed.ts` uses `ScheduleSlotFactory.createSessionTemplate` reading practitioner duration from DB.

---

## 2. Database Migration (`0011_clinic_schedule_policies`)

A dedicated configuration table `clinic_schedule_policies` was created and applied via migration `0011_clinic_schedule_policies.sql`:

```sql
CREATE TABLE IF NOT EXISTS "clinic_schedule_policies" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "default_consultation_duration_minutes" integer DEFAULT 30 NOT NULL,
  "start_precision_minutes" integer DEFAULT 1 NOT NULL,
  "min_consultation_duration_minutes" integer DEFAULT 5 NOT NULL,
  "max_consultation_duration_minutes" integer DEFAULT 120 NOT NULL,
  "early_morning_shift_start" varchar(5) DEFAULT '00:00' NOT NULL,
  "early_morning_shift_end" varchar(5) DEFAULT '06:00' NOT NULL,
  "morning_shift_start" varchar(5) DEFAULT '06:00' NOT NULL,
  "morning_shift_end" varchar(5) DEFAULT '12:00' NOT NULL,
  "afternoon_shift_start" varchar(5) DEFAULT '12:00' NOT NULL,
  "afternoon_shift_end" varchar(5) DEFAULT '18:00' NOT NULL,
  "night_shift_start" varchar(5) DEFAULT '18:00' NOT NULL,
  "night_shift_end" varchar(5) DEFAULT '24:00' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

### Hierarchy of Persistence:
1. **Practitioner Override**: `practitioners.consultation_duration_minutes` (e.g., specialist with 45m or generalist with 30m).
2. **Clinic Policy**: `clinic_schedule_policies.default_consultation_duration_minutes` (default: 30 minutes).

---

## 3. Mathematical Factory Pattern: `ScheduleSlotFactory`

Location: `src/modules/schedules/domain/factories/schedule-slot.factory.ts`

### Capabilities:
- `timeToMinutes(time: string): number` & `minutesToTime(minutes: number): string`: Converts clock times (`HH:mm` or `24:00`) to minute integers and back.
- `resolveShiftFromClockTime(clockTime: string, boundaries?): ShiftCode`: Pure boundary determination.
- `calculateSessionTiming(params)`:
  - When `startTime` is provided and `endTime` is omitted:
    - Calculates `durationMinutes = practitionerDuration ?? policyDuration`.
    - If `fillShift = false`: Sets `endMinutes = startMinutes + durationMinutes`, `capacity = 1`.
    - If `fillShift = true`: Calculates available minutes to shift end and sets `capacity = Math.floor(availableMinutes / durationMinutes)`.
    - Dynamically computes `remainingShiftSlots = Math.floor((shiftEndMinutes - endMinutes) / durationMinutes)`.
- `generateShiftSlots(startTime, endTime, intervalMinutes)`: Pure loop producing `start_time` and `end_time` intervals.
- `createSessionTemplate(shift, durationMinutes, options)`: Returns domain session templates without hardcoded arrays.

---

## 4. API Endpoints & Request/Response Contracts

### A. Dynamic Availability Projection: `GET /api/v1/admin/doctor-schedules/projection/availability`

Query Parameters:
- `practitionerId` (string, optional)
- `shift` (enum: `DINI_HARI`, `PAGI`, `SIANG`, `MALAM`, optional)
- `startTime` (string, `HH:mm`, optional)
- `endTime` (string, `HH:mm`, optional)
- `slotsCount` (number, optional)
- `fillShift` (boolean, optional, default: `false`)

#### Scenario 1: Doctor starts afternoon shift at 14:00 (single slot default)
**Request:**
```http
GET /api/v1/admin/doctor-schedules/projection/availability?startTime=14:00
```
**Response:**
```json
{
  "shift": "SIANG",
  "shiftCode": "afternoon",
  "shiftLabel": "Siang (12:00 - 18:00)",
  "startTime": "14:00",
  "projectedEndTime": "14:30",
  "capacity": 1,
  "slotDurationMinutes": 30,
  "shiftBoundary": {
    "start": "12:00",
    "end": "18:00"
  },
  "slots": [
    {
      "slotNumber": 1,
      "startTime": "14:00",
      "endTime": "14:30"
    }
  ],
  "remainingShiftSlots": 7,
  "explanation": "Calculated by ScheduleSlotFactory: 1 slots @ 30 mins each (14:00 - 14:30). Shift ends at 18:00 (7 remaining slots capacity)."
}
```
*Mathematical explanation:* Siang shift is `12:00 - 18:00`. Session is `14:00 - 14:30`. Remaining time until 18:00 is `3 hours 30 mins` = `210 mins`. `210 / 30 = 7` remaining slots.

#### Scenario 2: Doctor starts morning shift at 09:00
**Request:**
```http
GET /api/v1/admin/doctor-schedules/projection/availability?startTime=09:00
```
**Response:**
```json
{
  "shift": "PAGI",
  "shiftCode": "morning",
  "shiftLabel": "Pagi (06:00 - 12:00)",
  "startTime": "09:00",
  "projectedEndTime": "09:30",
  "capacity": 1,
  "slotDurationMinutes": 30,
  "shiftBoundary": {
    "start": "06:00",
    "end": "12:00"
  },
  "slots": [
    {
      "slotNumber": 1,
      "startTime": "09:00",
      "endTime": "09:30"
    }
  ],
  "remainingShiftSlots": 5,
  "explanation": "Calculated by ScheduleSlotFactory: 1 slots @ 30 mins each (09:00 - 09:30). Shift ends at 12:00 (5 remaining slots capacity)."
}
```
*Mathematical explanation:* Pagi shift ends at `12:00`. Remaining time from `09:30` to `12:00` is `2 hours 30 mins` = `150 mins`. `150 / 30 = 5` remaining slots.

#### Scenario 3: Full morning shift fill from 06:00
**Request:**
```http
GET /api/v1/admin/doctor-schedules/projection/availability?startTime=06:00&fillShift=true
```
**Response:**
```json
{
  "shift": "PAGI",
  "shiftCode": "morning",
  "shiftLabel": "Pagi (06:00 - 12:00)",
  "startTime": "06:00",
  "projectedEndTime": "12:00",
  "capacity": 12,
  "slotDurationMinutes": 30,
  "shiftBoundary": {
    "start": "06:00",
    "end": "12:00"
  },
  "slots": [
    { "slotNumber": 1, "startTime": "06:00", "endTime": "06:30" },
    { "slotNumber": 2, "startTime": "06:30", "endTime": "07:00" },
    "...",
    { "slotNumber": 12, "startTime": "11:30", "endTime": "12:00" }
  ],
  "remainingShiftSlots": 0
}
```
*Mathematical explanation:* 6 hours = 360 minutes / 30 = exactly 12 slots. 0 remaining slots.

---

### B. Shift & Schedule Options: `GET /api/v1/admin/doctor-schedules/reference/options` (and `/options`)

Returns all 4 shifts (24-hour cycle) with DB-sourced durations:

```json
{
  "shifts": [
    {
      "code": "early_morning",
      "name": "Dini Hari",
      "canonical_status": "DINI_HARI",
      "default_start_time": "00:00",
      "default_end_time": "06:00",
      "default_quota": 12
    },
    {
      "code": "morning",
      "name": "Pagi",
      "canonical_status": "PAGI",
      "default_start_time": "06:00",
      "default_end_time": "12:00",
      "default_quota": 12
    },
    {
      "code": "afternoon",
      "name": "Siang",
      "canonical_status": "SIANG",
      "default_start_time": "12:00",
      "default_end_time": "18:00",
      "default_quota": 12
    },
    {
      "code": "night",
      "name": "Malam",
      "canonical_status": "MALAM",
      "default_start_time": "18:00",
      "default_end_time": "24:00",
      "default_quota": 12
    }
  ],
  "default_consultation_duration_minutes": 30,
  "start_precision_minutes": 1
}
```

---

## 5. Guidance for Frontend (Next.js Web Admin) & Mobile (Flutter)

1. **Pure Consumer Architecture**: Frontend must **never** calculate end times or slot lists with local arithmetic or hardcoded 30-minute variables. Always consume the response from `GET /api/v1/admin/doctor-schedules/projection/availability`.
2. **Dynamic Start Time Change**: When an admin selects or changes `startTime` on the schedule form:
   - Call the projection endpoint passing the selected `startTime` and `practitionerId`.
   - Update the form's `endTime`, `capacity`, and slot previews with the backend's `projectedEndTime`, `capacity`, and `slots`.
3. **No Fallback Hardcoding**: If an API request fails, surface a retry error. Do not fall back to local constants.
4. **24-Hour Shifts**: Update shift dropdowns to include all 4 options:
   - Dini Hari (`00:00` - `06:00`)
   - Pagi (`06:00` - `12:00`)
   - Siang (`12:00` - `18:00`)
   - Malam (`18:00` - `24:00`)
