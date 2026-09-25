# Authoritative Backend Implementation Contract: Doctor Schedule Management ("Jadwal Dokter")

> **Document Version:** 1.0.0 (Authoritative Backend Contract)  
> **Target Audience:** Frontend Mobile Engineers (Flutter), Backend Engineers (NestJS), System Architects  
> **Source Manifest:** Feature Backend Requirement Delegation Report: Doctor Schedule Management ("Jadwal Dokter")  
> **Evaluator:** Backend Requirement Verification & Implementation Agent (NestJS)  
> **Date:** 20 September 2026  
> **Status:** Final & Production Ready  
> **Compliance:** NestJS v11, PostgreSQL 17, Drizzle ORM, RFC 7807 Problem Details

---

## 1. Feature Identification & Overview

* **Feature Name:** Doctor Schedule Management ("Jadwal Praktik Dokter")
* **Target Users:** Internal clinic staff only — specifically doctors (`practitioner` / `staff_doctor`) and authorized clinic administrators (`admin`). **Not patient-facing.**
* **Scope:**
  1. Reading doctor schedules by date and date ranges (including 25-day coverflow and monthly calendar summary).
  2. Creating doctor practice schedule sessions (date, session type, start time, end time, room, poliklinik/service).
  3. Updating doctor practice schedule sessions (times, room, poliklinik, status).
  4. Deleting doctor practice schedule sessions (with booking conflict protection).
  5. Reading and updating daily practice settings (target patient quota and leave / *cuti* status).
  6. Querying booked patient records associated with specific practice sessions (including medical complaint, queue ticket, and age).
  7. Providing selectable reference data for clinic rooms, poliklinik units/services, and real-time conflict detection.

---

## 2. Schema Compatibility Matrix

The following matrix documents the verification of each requirement from the frontend delegation manifest against the real PostgreSQL database schema and Drizzle definitions in `src/database/schema/amanah.schema.ts`:

| Manifest Requirement | Existing Backend Schema Element | Status | Evidence (File & Line / Constraint) | Evaluation & Action Needed |
|---|---|---|---|---|
| **1. Store Practice Schedule Session** (Date, Session Type, Start Time, End Time, Room, Poliklinik, Capacity, Status) | Table `practitioner_schedule_sessions` | ✅ Fully Supported | `src/database/schema/amanah.schema.ts:1384-1457` (`practitionerScheduleSessions`) | All columns exist: `practitionerId`, `scheduleDate`, `sessionLabel`, `sessionShift`, `startTime`, `endTime`, `roomId`, `serviceId`, `capacity`, `availableSlots`, `status`, `notes`. Unique constraint on `(practitionerId, scheduleDate, startTime)`. Check constraint `end_time > start_time`. **Action:** Extend Drizzle repository mapping to expose `roomId`, `roomName`, `serviceId`, `serviceName`, and `bookedCount`. |
| **2. Day Schedule Settings** (Target Quota, isCuti, cutiReason) | Table `practitioner_schedule_day_settings` | ✅ Fully Supported | `src/database/schema/amanah.schema.ts:1204-1250` (`practitionerScheduleDaySettings`) | Table exists with exact columns: `practitionerId`, `scheduleDate`, `targetQuota`, `isLeave`, `leaveReason`, `createdBy`. Unique constraint `(practitionerId, scheduleDate)`. Check constraints for non-negative quota and non-blank reason. **Action:** Implement repository methods and CRUD endpoints in `src/modules/schedules`. |
| **3. Monthly Calendar Overview** (Has schedule, isCuti, booked patient count) | Aggregated from `practitioner_schedule_sessions`, `practitioner_schedule_day_settings`, and `appointments` | ✅ Fully Supported | `src/database/schema/amanah.schema.ts:1204, 1384, 1459` | Underlying relational structures contain all needed fields. **Action:** Implement `GET /api/v1/schedules/calendar-summary?month=YYYY-MM` endpoint. |
| **4. Booked Patients List for Session/Date** (Patient ID, Name, RM, Age, Queue Number, Time Slot, Status, Complaint, Guardian) | Tables `appointments`, `patient_profiles`, `queue_tickets` | ✅ Fully Supported | `src/database/schema/amanah.schema.ts:772` (`patientProfiles`), `1459` (`appointments`), `1619` (`queueTickets`) | `appointments` links `patientId`, `scheduleSessionId`, `complaint`, `guardianNameSnapshot`. `patientProfiles` provides `fullName`, `medicalRecordNumber`, `birthDate`, `gender`, `avatarUrl`. `queueTickets` provides `queueNumber` and queue `status`. **Action:** Implement `GET /api/v1/schedules/:id/booked-patients` and `GET /api/v1/schedules/booked-patients?date=YYYY-MM-DD`. |
| **5. Clinic Rooms Reference** (Selectable practice rooms) | Table `clinic_rooms` | ✅ Fully Supported | `src/database/schema/amanah.schema.ts:614-643` (`clinicRooms`) | Columns: `id`, `code`, `name`, `unitId`, `isActive`. **Action:** Provide `GET /api/v1/schedules/reference/rooms` endpoint. |
| **6. Poliklinik / Services Reference** | Tables `clinic_units`, `clinic_services` | ✅ Fully Supported | `src/database/schema/amanah.schema.ts:588` (`clinicUnits`), `670` (`clinicServices`) | `GET /api/v1/clinics/poliklinik` already exists. **Action:** Re-use existing endpoint and document in contract. |
| **7. Time & Room Conflict Detection** | Server-side validation queries on `practitioner_schedule_sessions` | ✅ Fully Supported | Service layer validation over `practitionerScheduleSessions` | Overlap logic `(startTime < existing.endTime AND endTime > existing.startTime)` for both doctor and room. Returns HTTP 409 Conflict. |
| **8. Deletion Protection with Active Bookings** | Relational check on `appointments.scheduleSessionId` | ✅ Fully Supported | `src/database/schema/amanah.schema.ts:1560-1564` (`appointments_schedule_session_id_fkey`) | FK constraint has `onDelete: 'set null'`. To prevent accidental data abandonment, service layer validates active bookings and blocks deletion with HTTP 409 if active patients exist. |

---

## 3. Schema Adjustment Assessment

**Conclusion: NO DATABASE MIGRATION REQUIRED.**

The existing PostgreSQL database schema (`amanah.schema.ts`) already contains all required tables, columns, relations, and check constraints designed specifically for clinical doctor scheduling:
* `practitioner_schedule_sessions`
* `practitioner_schedule_day_settings`
* `appointments`
* `queue_tickets`
* `patient_profiles`
* `clinic_rooms`
* `clinic_services`
* `clinic_units`
* `practitioners`
* `staff_profiles`

There are **zero missing columns** and **zero data type incompatibilities**. All work is strictly focused on establishing the NestJS service methods, DTOs, and REST controller endpoints in `src/modules/schedules`.

---

## 4. Authoritative Backend Implementation Contract

### A. Architectural Placement
* **Module:** `SchedulesModule` (`src/modules/schedules/schedules.module.ts`)
* **Controller:** `SchedulesController` (`src/modules/schedules/presentation/schedules.controller.ts`)
* **Repository:** `ScheduleDrizzleRepository` (`src/modules/schedules/infrastructure/drizzle/schedule.drizzle-repository.ts`)
* **Authentication Guard:** `HybridAuthGuard` (`src/common/auth/hybrid-auth.guard.ts`)
* **Authorization Guard:** `RolesGuard` (`src/common/auth/roles.guard.ts`) with `@Roles('ADMIN', 'STAF')`

---

### B. REST Endpoints Specification

#### 1. `GET /api/v1/schedules/my-schedules`
* **Description:** Retrieve practice schedule sessions for the authenticated doctor.
* **Access:** Doctor / Staff (`@Roles('STAF', 'ADMIN')`)
* **Query Parameters:**
  * `date` (optional, string `YYYY-MM-DD`): Filter sessions for a specific date.
  * `startDate` (optional, string `YYYY-MM-DD`): Range start date.
  * `endDate` (optional, string `YYYY-MM-DD`): Range end date.
* **Success Response (HTTP 200 OK):**
  ```json
  [
    {
      "id": "67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1",
      "staffId": "123e4567-e89b-12d3-a456-426614174000",
      "staffName": "dr. Sarah Jenkins, Sp.A",
      "profession": "Spesialis Anak",
      "scheduleDate": "2026-08-26",
      "sessionLabel": "Pagi",
      "sessionShift": "morning",
      "startTime": "07:00",
      "endTime": "11:00",
      "timeRange": "07:00 - 11:00 WIB",
      "roomId": "room-uuid-201",
      "roomName": "Ruang 201",
      "poliklinikId": "poli-uuid-anak",
      "poliklinikName": "Poli Anak",
      "capacity": 8,
      "availableSlots": 3,
      "bookedPatientCount": 5,
      "status": "Buka",
      "rawStatus": "open",
      "notes": "Praktek spesialis reguler",
      "createdAt": "2026-08-20T08:00:00.000Z",
      "updatedAt": "2026-08-20T08:00:00.000Z"
    }
  ]
  ```

---

#### 2. `GET /api/v1/schedules/calendar-summary`
* **Description:** Retrieve a lightweight monthly calendar overview for the authenticated doctor, showing schedule presence, leave status, and booked patient totals for each day.
* **Access:** Doctor / Staff (`@Roles('STAF', 'ADMIN')`)
* **Query Parameters:**
  * `month` (required, string `YYYY-MM`, e.g. `2026-08`): Target month.
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "month": "2026-08",
    "days": [
      {
        "date": "2026-08-26",
        "hasSchedule": true,
        "isCuti": false,
        "cutiReason": null,
        "sessionCount": 2,
        "targetQuota": 8,
        "bookedPatientCount": 5,
        "capacityPercentage": 63
      },
      {
        "date": "2026-08-27",
        "hasSchedule": false,
        "isCuti": true,
        "cutiReason": "Dokter Cuti Praktik: Simposium Medis",
        "sessionCount": 0,
        "targetQuota": 0,
        "bookedPatientCount": 0,
        "capacityPercentage": 0
      }
    ]
  }
  ```

---

#### 3. `GET /api/v1/schedules/day-settings`
* **Description:** Retrieve daily practice quota and leave (*cuti*) status for a specific date.
* **Access:** Doctor / Staff (`@Roles('STAF', 'ADMIN')`)
* **Query Parameters:**
  * `date` (required, string `YYYY-MM-DD`, e.g. `2026-08-26`): Target practice date.
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "id": "day-setting-uuid-001",
    "practitionerId": "practitioner-uuid-001",
    "scheduleDate": "2026-08-26",
    "targetQuota": 8,
    "isCuti": false,
    "cutiReason": null,
    "totalBookedPatients": 5,
    "capacityPercentage": 63
  }
  ```

---

#### 4. `PUT /api/v1/schedules/day-settings`
* **Description:** Update daily practice quota and/or toggle leave (*cuti*) status for a specific date.
* **Access:** Doctor / Staff (`@Roles('STAF', 'ADMIN')`)
* **Request Body:**
  ```json
  {
    "date": "2026-08-26",
    "targetQuota": 10,
    "isCuti": false,
    "cutiReason": null
  }
  ```
* **Success Response (HTTP 200 OK):**
  Returns the updated `day-settings` object.

---

#### 5. `GET /api/v1/schedules/:id/booked-patients`
* **Description:** Retrieve the list of patients booked for a specific practice session.
* **Access:** Doctor / Staff (`@Roles('STAF', 'ADMIN')`)
* **Success Response (HTTP 200 OK):**
  ```json
  [
    {
      "id": "patient-uuid-101",
      "appointmentId": "appointment-uuid-501",
      "fullName": "Siti Rahma",
      "medicalRecordNumber": "RM-2026-0412",
      "age": "28 Thn",
      "gender": "Perempuan",
      "queueNumber": "#01",
      "timeSlot": "08:00 - 09:30 WIB",
      "sessionTitle": "Sesi Pagi",
      "room": "Ruang 201",
      "guardian": null,
      "complaint": "Demam tinggi 3 hari disertai batuk pilek dan sakit tenggorokan",
      "status": "booked",
      "statusBadge": "Booked",
      "avatarUrl": "https://cdn.amanah.id/avatars/patient-101.jpg"
    }
  ]
  ```

---

#### 6. `POST /api/v1/schedules`
* **Description:** Create a new doctor practice schedule session.
* **Access:** Doctor / Staff (`@Roles('STAF', 'ADMIN')`)
* **Request Body:**
  ```json
  {
    "date": "2026-08-26",
    "sessionType": "Pagi",
    "startTime": "07:00",
    "endTime": "11:00",
    "roomId": "room-uuid-201",
    "roomName": "Ruang 201",
    "poliklinikId": "poli-uuid-anak",
    "capacity": 8,
    "notes": "Praktek spesialis reguler"
  }
  ```
* **Validation & Business Rules:**
  1. `startTime` must be strictly before `endTime` (chronological order).
  2. Doctor cannot have overlapping sessions on the same date.
  3. Room cannot be occupied by another practitioner during the specified hours.
* **Success Response (HTTP 201 Created):**
  Returns complete authoritative `ScheduleEntity`.
* **Conflict Response (HTTP 409 Conflict):**
  ```json
  {
    "type": "https://amanah.health/errors/conflict",
    "title": "Conflict",
    "status": 409,
    "statusCode": 409,
    "code": "ROOM_ALREADY_OCCUPIED",
    "message": "Ruang 201 sudah dijadwalkan untuk dokter lain pada jam 07:00 - 11:00 WIB.",
    "detail": "Ruang 201 sudah dijadwalkan untuk dokter lain pada jam 07:00 - 11:00 WIB.",
    "instance": "/api/v1/schedules"
  }
  ```

---

#### 7. `PATCH /api/v1/schedules/:id`
* **Description:** Update an existing practice schedule session.
* **Access:** Doctor / Staff (`@Roles('STAF', 'ADMIN')`)
* **Request Body:**
  ```json
  {
    "sessionType": "Siang",
    "startTime": "13:00",
    "endTime": "17:00",
    "roomId": "room-uuid-201",
    "poliklinikId": "poli-uuid-anak",
    "capacity": 10,
    "status": "Buka",
    "notes": "Jadwal dimajukan 30 menit"
  }
  ```
* **Success Response (HTTP 200 OK):**
  Returns updated `ScheduleEntity`.

---

#### 8. `DELETE /api/v1/schedules/:id`
* **Description:** Delete / cancel a practice schedule session.
* **Access:** Doctor / Staff (`@Roles('STAF', 'ADMIN')`)
* **Business Rule:** If the session already has active patient bookings (`booked`, `checked_in`, `waiting`), the deletion is **rejected** to protect clinical safety.
* **Success Response (HTTP 204 No Content)**
* **Conflict Response (HTTP 409 Conflict):**
  ```json
  {
    "type": "https://amanah.health/errors/conflict",
    "title": "Conflict",
    "status": 409,
    "statusCode": 409,
    "code": "SCHEDULE_HAS_ACTIVE_BOOKINGS",
    "message": "Jadwal tidak dapat dihapus karena sudah memiliki 5 pasien terdaftar. Batalkan atau jadwalkan ulang janji temu pasien terlebih dahulu.",
    "detail": "Jadwal tidak dapat dihapus karena sudah memiliki 5 pasien terdaftar.",
    "instance": "/api/v1/schedules/67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1"
  }
  ```

---

#### 9. `GET /api/v1/schedules/reference/rooms`
* **Description:** Retrieve the list of active clinic practice rooms with real-time occupancy status.
* **Access:** Authenticated Users (`@Roles('STAF', 'ADMIN', 'PATIENT')`)
* **Query Parameters:**
  * `date` (optional, `YYYY-MM-DD`): Check occupancy on specific date.
  * `startTime` (optional, `HH:mm`): Start time window.
  * `endTime` (optional, `HH:mm`): End time window.
* **Success Response (HTTP 200 OK):**
  ```json
  [
    {
      "id": "room-uuid-101",
      "code": "R101",
      "name": "Ruang 101",
      "location": "Lantai 1, Sayap Timur",
      "floor": "1",
      "isOccupied": false
    },
    {
      "id": "room-uuid-201",
      "code": "R201",
      "name": "Ruang 201",
      "location": "Lantai 2, Sayap Barat",
      "floor": "2",
      "isOccupied": true,
      "occupiedBy": "dr. Budi Setiawan, Sp.PD (08:00 - 12:00 WIB)"
    }
  ]
  ```

---

## 5. Resolution of Manifest Open Questions

| # | Question from Manifest | Authoritative Backend Decision | Technical Justification |
|---|---|---|---|
| **1** | **Timezone & Date Standard** | Standard ISO 8601 for dates (`YYYY-MM-DD`) and 24-hour strings (`HH:mm` or `HH:mm:ss`) in local clinic timezone (WIB / UTC+7). | PostgreSQL `date` and `time` columns store `YYYY-MM-DD` and `HH:mm:ss`. The backend automatically appends `" WIB"` to presentation fields (`timeRange`) for client convenience while exposing raw `startTime` (`07:00`) and `endTime` (`11:00`). |
| **2** | **Multi-Slot Persistence** | Each continuous practice time window is an **independent schedule session record** in `practitioner_schedule_sessions`. | A doctor who practices in the morning (`07:00 - 11:00`) and evening (`18:00 - 21:00`) creates two separate session records. If the doctor has a break within a shift, each sub-slot is a separate session record. This preserves relational integrity with `appointments.schedule_session_id`. |
| **3** | **Deletion Policy with Active Bookings** | **Deletion is strictly blocked (HTTP 409 Conflict)** if active patient bookings exist (`SCHEDULE_HAS_ACTIVE_BOOKINGS`). | Deleting a schedule with booked patients would cause clinical safety violations and orphaned patients in the queue. Doctors/admin must explicitly reschedule or cancel appointments before deleting the session. |
| **4** | **Authoritative Quota Configuration** | Daily `targetQuota` is stored per-doctor per-date in `practitioner_schedule_day_settings.target_quota`. | Defaults to `8` if not explicitly set. It is configurable per doctor per day via `PUT /api/v1/schedules/day-settings`. |
| **5** | **Downstream Web Consumer Contract** | Patient bookings created via the web app write directly to `appointments` linking `schedule_session_id`. | The mobile app retrieves fresh booking counts and patient lists via standard HTTP polling / pull-to-refresh on screen focus. |

---

## 6. Dart / Flutter Mobile Integration Guide

### A. Model Definition (`doctor_schedule_dto.dart`)
```dart
class DoctorScheduleSessionDto {
  final String id;
  final String staffId;
  final String staffName;
  final String profession;
  final String scheduleDate;
  final String sessionLabel; // 'Pagi', 'Siang', 'Malam', 'Dini Hari'
  final String startTime;    // '07:00'
  final String endTime;      // '11:00'
  final String timeRange;    // '07:00 - 11:00 WIB'
  final String? roomId;
  final String? roomName;
  final String? poliklinikId;
  final String? poliklinikName;
  final int capacity;
  final int availableSlots;
  final int bookedPatientCount;
  final String status;       // 'Buka', 'Menunggu', 'Cuti'

  DoctorScheduleSessionDto({
    required this.id,
    required this.staffId,
    required this.staffName,
    required this.profession,
    required this.scheduleDate,
    required this.sessionLabel,
    required this.startTime,
    required this.endTime,
    required this.timeRange,
    this.roomId,
    this.roomName,
    this.poliklinikId,
    this.poliklinikName,
    required this.capacity,
    required this.availableSlots,
    required this.bookedPatientCount,
    required this.status,
  });

  factory DoctorScheduleSessionDto.fromJson(Map<String, dynamic> json) {
    return DoctorScheduleSessionDto(
      id: json['id'] as String,
      staffId: json['staffId'] as String,
      staffName: json['staffName'] as String? ?? 'Dokter Amanah',
      profession: json['profession'] as String? ?? 'Dokter Umum',
      scheduleDate: json['scheduleDate'] as String,
      sessionLabel: json['sessionLabel'] as String? ?? 'Pagi',
      startTime: json['startTime'] as String,
      endTime: json['endTime'] as String,
      timeRange: json['timeRange'] as String? ?? '${json['startTime']} - ${json['endTime']} WIB',
      roomId: json['roomId'] as String?,
      roomName: json['roomName'] as String?,
      poliklinikId: json['poliklinikId'] as String?,
      poliklinikName: json['poliklinikName'] as String?,
      capacity: json['capacity'] as int? ?? 8,
      availableSlots: json['availableSlots'] as int? ?? 8,
      bookedPatientCount: json['bookedPatientCount'] as int? ?? 0,
      status: json['status'] as String? ?? 'Buka',
    );
  }
}
```

### B. HTTP Client Integration (`schedule_api_service.dart`)
```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ScheduleApiService {
  final String baseUrl;
  final String Function() getAccessToken;

  ScheduleApiService({
    required this.baseUrl,
    required this.getAccessToken,
  });

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ${getAccessToken()}',
  };

  /// 1. Fetch schedules for a specific date
  Future<List<DoctorScheduleSessionDto>> getSchedulesByDate(String date) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/v1/schedules/my-schedules?date=$date'),
      headers: _headers,
    );
    if (response.statusCode == 200) {
      final List<dynamic> list = jsonDecode(response.body);
      return list.map((e) => DoctorScheduleSessionDto.fromJson(e)).toList();
    }
    throw Exception('Gagal mengambil jadwal: ${response.body}');
  }

  /// 2. Fetch monthly calendar summary
  Future<Map<String, dynamic>> getCalendarSummary(String month) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/v1/schedules/calendar-summary?month=$month'),
      headers: _headers,
    );
    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception('Gagal mengambil ringkasan kalender: ${response.body}');
  }

  /// 3. Create schedule session
  Future<DoctorScheduleSessionDto> createSchedule(Map<String, dynamic> payload) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/schedules'),
      headers: _headers,
      body: jsonEncode(payload),
    );
    if (response.statusCode == 201) {
      return DoctorScheduleSessionDto.fromJson(jsonDecode(response.body));
    }
    final error = jsonDecode(response.body);
    throw Exception(error['message'] ?? 'Gagal membuat jadwal');
  }

  /// 4. Delete schedule session
  Future<void> deleteSchedule(String scheduleId) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/api/v1/schedules/$scheduleId'),
      headers: _headers,
    );
    if (response.statusCode == 204) return;
    final error = jsonDecode(response.body);
    throw Exception(error['message'] ?? 'Gagal menghapus jadwal');
  }
}
```
