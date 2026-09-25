# Feature Backend Requirement Delegation Report: Doctor Schedule Management ("Jadwal Dokter")

## 1. Feature Identification

* **Feature Name:** Doctor Schedule Management ("Jadwal Dokter" / "Jadwal Praktik Dokter")
* **Feature Scope:** End-to-end frontend schedule management including creating, reading, updating, and deleting (CRUD) doctor practice sessions, managing daily practice quota and leave (*cuti*) status, navigating monthly schedule calendars, inspecting booked patient queues, reviewing patient complaint details, and dynamically querying all selection options (poliklinik, rooms, shifts, times, statuses) from backend read endpoints rather than hardcoding static lists.
* **Primary Frontend Platform:** Flutter Mobile Application (Android & iOS)
* **Codebase Location:** `packages/amanah_healthcare/lib/features/schedule/` and `packages/amanah_healthcare/lib/features/home/presentation/screen/amanah_schedule_tab_screen.dart`
* **Target Users:** Internal clinic medical and administrative staff (doctors / bidan / clinic admins). This feature is **not patient-facing**.
* **Report Purpose:** Provide the backend engineering team with an evidence-based, implementation-agnostic technical requirement delegation manifest detailing all capabilities, inputs, read dependencies, dynamic options endpoints, write actions, validations, UI states, and failure semantics required by the mobile frontend.

---

## 2. Executive Summary

The Doctor Schedule Management feature enables internal clinic doctors (and authorized clinic staff) to view and manage their practice schedules, track daily patient booking capacity, manage leave (*cuti*), and review patients booked for each practice session.

### Current Implementation State & Architectural Shift
* **Frontend Architecture:** The UI is structured as a dedicated tab screen (`AmanahScheduleTabScreen`) accessible from the home shell (`AmanahHomeShell`), supported by a singleton ChangeNotifier store (`AmanahScheduleStore`) backed by `AmanahScheduleRepository`.
* **Static Options Elimination (User Mandate):** All static options in the schedule domain—such as poliklinik choices, clinic rooms, room occupancy states, practice shifts, time slots, schedule operational statuses, and default capacity quotas—**must not be hardcoded in the frontend**. They must be provided dynamically by authoritative backend read endpoints.
* **Backend Capabilities Established / Required:**
  1. Reading doctor schedules by date and date ranges (including monthly status indicators for the calendar view).
  2. Creating new doctor practice schedules.
  3. Updating existing practice schedules (times, rooms, poliklinik, capacity, and operational status).
  4. Deleting practice schedules with active booking safety rules.
  5. Reading and updating daily practice settings (target patient quota and leave / *cuti* status).
  6. Retrieving booked patient records associated with specific practice sessions.
  7. **Dynamic Reference Options Endpoints:** Authoritative read endpoints providing active clinic rooms with real-time occupancy status, active poliklinik departments, permitted practice shifts/sessions, allowed scheduling time increments, and lifecycle status definitions.
* **Key Unknowns:** Multi-slot session persistence semantics (single record vs parent-child slots), authoritative cancellation cascading when a session with active bookings is deleted, and external patient booking notification synchronization (push/SSE vs polling).

---

## 3. User and Access Context

* **Intended Users:** Internal clinic staff only — specifically doctors (`AmanahUserRole.doctor`), midwives/nurses, and authorized clinic administrative personnel. This feature is **not patient-facing**.
* **User Journey Context:** A doctor opens the mobile application to view their assigned or created practice hours for the day/month, see how many patients have booked slots, adjust or cancel their sessions, add new practice availability, or declare leave (*cuti*).
* **Authentication Dependency:**
  * Observed in codebase: The application runs within an authenticated user context (`AmanahAuthUser`, e.g. `role: AmanahUserRole.doctor`).
  * The frontend client automatically attaches the user's session token as a Bearer token in the `Authorization` header (`AmanahScheduleRepository._buildHeaders`).
  * The backend resolves identity from the token (`req.user.staff.practitionerId` / `req.user.staff.id`).
* **Authorization Dependency:**
  * Doctors are authorized to manage **only their own** practice schedules, daily quota, and cuti status.
  * Clinic administrators (`ADMIN`) may create or adjust schedules across any practitioner.
  * Backend ownership guard enforces multi-tenancy isolation (`SchedulesController.assertScheduleOwnership`).

---

## 4. Feature User Journey

```
[Home Shell / Quick Access / Bottom Nav]
                   │
                   ▼
     [Overview View (AmanahScheduleTabScreen)]
       ├─► Radial Capacity Gauge (Booked vs Target Quota from backend)
       ├─► Date Carousel Strip (25-day horizontal coverflow)
       ├─► Cuti Alert Banner (if isCuti == true)
       ├─► Booked Patients Showcase (AmanahBookedPatientCard)
       │     └─► Tap Card ──► Patient Detail Modal (AmanahPatientDetailModal)
       │
       ├─► Tap "Lihat jadwal" ──► Monthly Calendar Drawer (AmanahDocScheduleCalendarDrawer)
       │                            └─► Select Date ──► Switch to Sessions View
       │
       ├─► Tap "+" Icon ──► Add Schedule Drawer (AmanahAddEditScheduleDrawer)
       │                      ├─► Fetch Reference Data (Poliklinik, Rooms, Shifts, Times)
       │                      └─► Save ──► Switch to Sessions View
       │
       └─► Switch View ──► [Sessions View (AmanahScheduleViewMode.sessions)]
                             ├─► Doctor Practice Session Cards (AmanahDoctorSessionCard)
                             │     ├─► Tap "Detail Sesi" ──► Session Detail Drawer (AmanahScheduleDetailDrawer)
                             │     │                           ├─► "Lihat Pasien Booking" ──► [Session Patients View]
                             │     │                           └─► "Edit Jadwal" ──► Edit Schedule Drawer
                             │     ├─► Tap "Edit" ──► Edit Schedule Drawer
                             │     └─► Tap "Delete" ──► Delete Schedule
                             └─► Empty State (if no sessions) ──► "Tambah Jadwal Dokter"
```

### Detailed Flow Steps:

1. **Entry to Overview:**
   - User navigates via bottom navigation bar "Jadwal", home quick action "Jadwal Saya", or today's schedule card on the home dashboard.
   - Screen initializes in `AmanahScheduleViewMode.overview`, invoking `loadSchedulesForDate()`, `loadDaySettings()`, and `loadCalendarSummary()`.
2. **Date Navigation:**
   - User swipes the horizontal date strip or taps "Lihat jadwal" to open `AmanahDocScheduleCalendarDrawer`.
   - Selecting a date triggers data fetch for that date and updates the view.
3. **Inspecting Booked Patients:**
   - Tapping any patient card opens `AmanahPatientDetailModal`, rendering patient name, Medical Record number (RM), age, queue number, time slot, session title, room, guardian (if present), and medical complaint notes.
4. **Creating a Schedule (Dynamic Options Ingestion):**
   - User taps the '+' icon button or "Tambah Jadwal".
   - `AmanahAddEditScheduleDrawer` opens and calls `_loadReferenceData()`.
   - Poliklinik options are loaded dynamically from the backend reference endpoint.
   - Room options with real-time occupancy status are loaded dynamically for the selected date and time.
   - User selects shift, time range, room, and poliklinik, then taps "Tambah Jadwal".
   - Mutation is dispatched to backend `createSchedule`. Upon success, the UI navigates to the sessions view for that date.
5. **Editing a Schedule:**
   - User triggers edit mode. `AmanahAddEditScheduleDrawer` populates current values and dynamic status choices ("Menunggu", "Buka", "Cuti").
   - Saving dispatches `updateSchedule`. If status is set to "Cuti", the day setting is also marked as cuti.
6. **Deleting a Schedule:**
   - User taps "Hapus" inside edit drawer or triggers session deletion.
   - Dispatches `deleteSchedule`. If active bookings exist, backend returns HTTP 409 (`SCHEDULE_HAS_ACTIVE_BOOKINGS`), displaying the conflict modal.
7. **Toggling Leave (*Cuti*):**
   - If marked as cuti, an amber banner is displayed.
   - Tapping "Buka Jadwal" dispatches `updateDayCuti(date, false)`.

---

## 5. Frontend Entry Points

| Type | Component / Route / Symbol | Source Location | Description |
|---|---|---|---|
| **Tab Route** | `AmanahHomeTab.schedule` | [amanah_home_shell.dart:237-250](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/home/presentation/screen/amanah_home_shell.dart#L237-L250) | Bottom navigation item "Jadwal" routing to schedule tab |
| **Quick Action** | `AmanahQuickAction` (`id: 'jadwal-saya'`) | [amanah_home_shell.dart:120-126](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/home/presentation/screen/amanah_home_shell.dart#L120-L126) | Quick access button "Jadwal Saya" on Home dashboard |
| **Home Card Tap** | `AmanahScheduleCardStack` | [amanah_home_shell.dart:143-150](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/home/presentation/screen/amanah_home_shell.dart#L143-L150) | Tapping today's schedule card on Home dashboard |
| **Screen** | `AmanahScheduleTabScreen` | [amanah_schedule_tab_screen.dart:15-774](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/home/presentation/screen/amanah_schedule_tab_screen.dart#L15-L774) | Primary schedule feature container supporting 3 view modes |
| **Drawer / Modal** | `AmanahAddEditScheduleDrawer` | [amanah_schedule_form_and_calendar_dialog.dart:511-1344](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/presentation/components/amanah_schedule_form_and_calendar_dialog.dart#L511-L1344) | Bottom sheet form for creating and editing doctor schedules |
| **Drawer / Modal** | `AmanahDocScheduleCalendarDrawer` | [amanah_schedule_form_and_calendar_dialog.dart:93-395](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/presentation/components/amanah_schedule_form_and_calendar_dialog.dart#L93-L395) | Monthly calendar view drawer |
| **Drawer / Modal** | `AmanahScheduleDetailDrawer` | [amanah_schedule_cards_and_drawers.dart:1001-1276](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/presentation/components/amanah_schedule_cards_and_drawers.dart#L1001-L1276) | Read-only session detail drawer with navigation to patient list and edit |
| **Modal** | `AmanahPatientDetailModal` | [amanah_schedule_cards_and_drawers.dart:1423-1491](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/presentation/components/amanah_schedule_cards_and_drawers.dart#L1423-L1491) | Detailed patient record & complaint modal |
| **Repository** | `AmanahScheduleRepository` | [amanah_schedule_repository.dart:9-514](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_repository.dart#L9-L514) | HTTP client performing REST communication with backend |
| **State Store** | `AmanahScheduleStore` | [amanah_schedule_store.dart:5-427](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_store.dart#L5-L427) | Singleton ChangeNotifier managing schedule state and caching |
| **Tests** | `amanah_schedule_repository_test.dart` | [amanah_schedule_repository_test.dart:1-440](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/test/features/schedule/amanah_schedule_repository_test.dart#L1-L440) | Unit tests verifying HTTP endpoints, headers, and 409 conflict decoding |

---

## 6. Input Inventory

The following table documents every input collected by the feature forms (`AmanahAddEditScheduleDrawer` and related selection sheets):

| Field | Purpose | Required? | Frontend Rule | Source | Transformation | Submitted? |
|---|---|---|---|---|---|---|
| `selectedDate` | Practice date for the schedule | Yes | Must be a valid date; past dates are unselectable in calendar | Date picker / inline calendar | Formatted to ISO string `'YYYY-MM-DD'` | Yes (`date` / `specificDate`) |
| `status` | Practice session operational status (Edit mode only) | Yes (in edit mode) | Allowed values dynamically retrieved from backend: `'Menunggu'`, `'Buka'`, `'Cuti'` | Radio pill selector | Mapped to `status`. If `'Cuti'`, triggers day cuti update | Yes (`status`) |
| `sessionType` | Practice session shift category | Yes | Sourced dynamically from backend shift options (e.g. `'Pagi'`, `'Siang'`, `'Malam'`) | Toggle switch / shift selector | Uppercased to `'PAGI'`, `'SIANG'`, `'MALAM'` | Yes (`session`, `sessionType`) |
| `from` / `startTime` | Session start time | Yes | Selected from dynamic time options or standard 24-hr picker | Selection sheet / time picker | Converted to `'HH:mm'` (24-hour format) | Yes (`startTime`) |
| `to` / `endTime` | Session end time | Yes | Selected from dynamic time options or standard 24-hr picker | Selection sheet / time picker | Converted to `'HH:mm'` (24-hour format) | Yes (`endTime`) |
| `roomId` / `room` | Assigned clinic practice room | Yes | Selected from dynamic room reference options (`ClinicRoomReference`) | Selection bottom sheet (`_AmanahScheduleSelectionSheet`) | Selected room UUID is mapped to `roomId`; name to `room` | Yes (`roomId`) |
| `poliklinikId` / `poli` | Poliklinik / department | Yes | Selected from dynamic poliklinik reference options (`ClinicPoliklinikReference`) | Selection bottom sheet (`_AmanahScheduleSelectionSheet`) | Selected poliklinik UUID is mapped to `poliklinikId`; name to `poli` | Yes (`poliklinikId`) |
| `capacity` | Maximum patient booking quota for session | Optional | Integer > 0 (defaults to clinic or doctor default quota) | Form field / default setting | Passed as integer | Yes (`capacity`) |
| `notes` | Doctor or session operational notes | Optional | Freeform text string | Text field | Passed directly | Yes (`notes`) |
| `isCuti` | Toggle whole-day doctor leave | Optional | Boolean flag | "Buka Jadwal" button or 'Cuti' status selection | Dispatched to `updateDaySettings` | Yes (`isCuti`) |
| `cutiReason` | Reason for doctor leave | Optional | Text description (defaults to `'Dokter Cuti Praktik'`) | Passed in `updateDaySettings` | Passed directly | Yes (`cutiReason`) |

---

## 7. Frontend Validation

### Frontend-Enforced Rules:
1. **Past Date Selection Prevention:** In `AmanahDocScheduleCalendarDrawer`, dates prior to today have disabled tap callbacks and dimmed styling.
2. **Occupied Room Disabling:** In `_AmanahScheduleSelectionSheet`, rooms returned with `isOccupied: true` from the backend reference query are visually disabled and cannot be chosen by another doctor.
3. **Active Session Fallback:** In `_saveSchedule()`, if no session toggle is explicitly selected, the form requires at least one active shift before submitting.
4. **Time Selection Consistency:** Start and end times must be valid clock times.

### Backend-Authoritative Rules Required:
1. **Chronological Validity:** Backend must validate `startTime < endTime`.
2. **Practitioner Schedule Collision:** Backend must reject overlapping sessions for the same doctor on the same date with HTTP 409 (`PRACTITIONER_ALREADY_SCHEDULED`).
3. **Room Overlap Collision:** Backend must reject room booking collisions across different doctors with HTTP 409 (`ROOM_ALREADY_OCCUPIED`).
4. **Active Bookings Deletion Guard:** Backend must reject deletion of a session that already has confirmed patient bookings with HTTP 409 (`SCHEDULE_HAS_ACTIVE_BOOKINGS`).
5. **Multi-Tenancy Protection:** Doctors can only create/modify schedules associated with their own `practitionerId` (`FORBIDDEN`).

---

## 8. Derived and Transformed Values

| Value | Derivation Source | Transformation Logic | Where Used | Submitted? | Authoritative Role |
|---|---|---|---|---|---|
| `dateKey` | `DateTime date` | `'$y-$m-$d'` zero-padded | Key in cache maps & query parameters | Yes (`date`) | ISO 8601 date standard |
| `timeStr` | `startTime`, `endTime` | `'$startTime - $endTime WIB'` | UI cards & detail display | No | Presentation only |
| `capacityPercentage` | `bookedCount`, `targetQuota`, `isCuti` | `if (isCuti || targetQuota <= 0) return 0; else round(bookedCount / targetQuota * 100)` | Radial capacity gauge on Overview | No | Derived UI metric |
| `badgeVariant` | `isAvailable` / `status` | `'Buka'` -> `success`, `'Tutup'`/`'Cuti'` -> `warning`, `'Menunggu'` -> `primary` | Card status badges | Yes (`status`, `isAvailable`) | Presentation tone |
| `id` | Backend response | Assigned UUID from database | Cache key, update & delete mutations | Yes (`id`) | Authoritative identifier |

---

## 9. Data Dependencies & Dynamic Reference Options

To fulfill the user requirement that **all static options must come from the backend**, the following options are identified and mapped to backend read capabilities:

| Domain Option | Current Frontend State | Required Backend Read Endpoint | Payload Schema Expected by Frontend |
|---|---|---|---|
| **Poliklinik Options** | Hardcoded `kPoliOptions` (18 items) fallback | `GET /api/v1/schedules/reference/polikliniks` | Array of `{ id: string, code: string, name: string, location?: string }` |
| **Room Options & Occupancy** | Hardcoded `kRoomOptions` (17 items) fallback | `GET /api/v1/schedules/reference/rooms?date=YYYY-MM-DD&startTime=HH:mm&endTime=HH:mm` | Array of `{ id: string, code: string, name: string, floor?: string, isOccupied: boolean, occupiedBy?: string }` |
| **Session Shift Options** | Hardcoded `'Dini Hari'`, `'Pagi'`, `'Siang'`, `'Malam'` | `GET /api/v1/schedules/reference/session-types` (or options metadata) | Array of `{ code: string, label: string, defaultStartTime: string, defaultEndTime: string }` |
| **Time Slot Increments** | Hardcoded `kTimeOptions` (24 hourly items) | `GET /api/v1/schedules/reference/time-slots?date=YYYY-MM-DD` | Array of `{ time: string, isAvailable: boolean }` or clinic operating hours config |
| **Practice Status Options** | Hardcoded `'Menunggu'`, `'Buka'`, `'Cuti'` | `GET /api/v1/schedules/reference/statuses` | Array of `{ code: string, label: string, description: string, variant: string }` |
| **Doctor Day Settings / Quota** | Hardcoded default quota 8 | `GET /api/v1/schedules/day-settings?date=YYYY-MM-DD` | `{ targetQuota: number, isCuti: boolean, cutiReason?: string, scheduleDate: string }` |

---

## 10. Read Capabilities Required

The backend must provide authoritative endpoints supporting the following read operations:

1. **Read Doctor Schedules by Date (`GET /api/v1/schedules/my-schedules`):**
   - Query parameters: `date` (`YYYY-MM-DD`), `startDate`, `endDate`.
   - Resolves schedules belonging to the authenticated doctor.
   - Returns array of schedule objects including ID, date, shift, times, room name/ID, poliklinik name/ID, capacity, booked patient count, and operational status.
2. **Read Monthly Calendar Summary (`GET /api/v1/schedules/calendar-summary`):**
   - Query parameters: `month` (`YYYY-MM`).
   - Returns day-by-day summary: `hasSchedule`, `isCuti`, `cutiReason`, `sessionCount`, `targetQuota`, `bookedPatientCount`, `capacityPercentage`.
3. **Read Day Settings (`GET /api/v1/schedules/day-settings`):**
   - Query parameters: `date` (`YYYY-MM-DD`).
   - Returns daily quota and cuti configuration for the doctor.
4. **Read Booked Patients (`GET /api/v1/schedules/:id/booked-patients` or `GET /api/v1/schedules/booked-patients`):**
   - Retrieves patient appointment details: patient name, RM number, age, queue number, time slot, appointment status, complaint notes, guardian details.
5. **Read Poliklinik References (`GET /api/v1/schedules/reference/polikliniks`):**
   - Returns all active poliklinik units.
6. **Read Room References with Dynamic Occupancy (`GET /api/v1/schedules/reference/rooms`):**
   - Query parameters: `date`, `startTime`, `endTime`.
   - Returns all clinic rooms with dynamic conflict evaluation (`isOccupied` and `occupiedBy`).
7. **Read Shift & Status Options Reference (`GET /api/v1/schedules/reference/options`):**
   - Returns authoritative shifts (e.g. PAGI, SIANG, MALAM), standard time increments, and valid status transitions.

---

## 11. Write and Action Capabilities Required

1. **Create Practice Schedule Session (`POST /api/v1/schedules`):**
   - Payload: `date`, `session`, `startTime`, `endTime`, `roomId`, `poliklinikId`, `capacity`, `notes`.
   - Authenticated doctor tenancy automatically derived or verified.
   - Conflict checks enforced: room occupancy, doctor time collision.
2. **Update Practice Schedule Session (`PATCH /api/v1/schedules/:id`):**
   - Payload: `startTime`, `endTime`, `roomId`, `poliklinikId`, `capacity`, `status`, `isAvailable`, `notes`.
   - Ownership verified before updating.
3. **Toggle Schedule Availability (`PATCH /api/v1/schedules/:id/availability`):**
   - Payload: `{ isAvailable: boolean }`.
   - Toggles booking intake for the session.
4. **Delete Practice Schedule Session (`DELETE /api/v1/schedules/:id`):**
   - Guarded: Rejects deletion if active patient bookings exist (`409 SCHEDULE_HAS_ACTIVE_BOOKINGS`).
5. **Upsert Day Settings (`PUT /api/v1/schedules/day-settings`):**
   - Payload: `date`, `targetQuota`, `isCuti`, `cutiReason`.
   - Updates doctor daily capacity and cuti declaration.

---

## 12. UI States and Expected Outcomes

| State | Trigger | Frontend Behavior | Backend Information or Capability Needed |
|---|---|---|---|
| **Initial / Loading** | Screen opened or pull-to-refresh | Spinner via `AmanahPullToRefresh` | Fast query response; paginated or date-scoped payload |
| **Loaded (Overview)** | Schedule and patient data retrieved | Renders radial capacity gauge, date carousel, booked patient cards | Schedule list with patient bookings, target quota, cuti flag |
| **Loaded (Sessions)** | User switches to sessions mode or saves schedule | Displays `AmanahDoctorSessionCard` list with booked counts | Schedule session list for selected date |
| **Loaded (Session Patients)** | User taps "Lihat Pasien Booking" in session drawer | Full-screen list of `AmanahBookedPatientCard` for session | List of `BookedPatient` records filtered by session ID |
| **Empty (No Patients)** | Selected date has 0 booked patients | Renders `AmanahEmptyState.box` with "Tambah Jadwal" action | Empty array `[]` for booked patients |
| **Empty (No Sessions)** | Selected date has 0 schedules | Renders `AmanahEmptyState.box` with "Tambah Jadwal Dokter" | Empty array `[]` for schedules |
| **Cuti Active** | Date has `isCuti == true` | Amber alert banner, capacity gauge shows 0% with "Cuti" badge | `isCuti: true` and `cutiReason` in day setting |
| **Options Loading** | Drawer opens | Async call to `loadPolikliniks()` and `loadRooms()` | Reference endpoints return list of active units and rooms |
| **Conflict State** | Room or time collision, or deleting booked session | Renders `AmanahBottomSheetScaffold` conflict modal with exact message | HTTP 409 with specific error code and user-friendly explanation |
| **Network / Server Failure** | Network timeout or 5xx response | Retains UI state, shows toast/banner error | Standardized error payload with error message |

---

## 13. Error Requirements

The frontend needs distinguishable failure semantics for the following scenarios:

1. `ROOM_ALREADY_OCCUPIED` (HTTP 409): Room is occupied by another practitioner during the specified window.
2. `PRACTITIONER_ALREADY_SCHEDULED` (HTTP 409): Doctor already has an active overlapping practice session.
3. `SCHEDULE_HAS_ACTIVE_BOOKINGS` (HTTP 409): Doctor attempts to delete a schedule session that has confirmed patient bookings.
4. `INVALID_TIME_RANGE` (HTTP 422): End time is earlier than or equal to start time.
5. `NOT_FOUND` (HTTP 404): Schedule ID does not exist.
6. `UNAUTHORIZED` (HTTP 401): Sesi autentikasi telah berakhir.
7. `FORBIDDEN` (HTTP 403): Doctor attempts to modify or delete another practitioner's schedule.

---

## 14. Existing Backend Dependencies

The mobile frontend has already implemented the client integration layer in `AmanahScheduleRepository` ([amanah_schedule_repository.dart:1-514](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_repository.dart#L1-L514)):
* `GET /api/v1/schedules/my-schedules`
* `GET /api/v1/schedules/calendar-summary`
* `GET /api/v1/schedules/day-settings`
* `PUT /api/v1/schedules/day-settings`
* `POST /api/v1/schedules`
* `PATCH /api/v1/schedules/:id`
* `PATCH /api/v1/schedules/:id/availability`
* `DELETE /api/v1/schedules/:id`
* `GET /api/v1/schedules/booked-patients` & `GET /api/v1/schedules/:id/booked-patients`
* `GET /api/v1/schedules/reference/rooms`
* `GET /api/v1/schedules/reference/polikliniks`

---

## 15. Backend Request

The frontend requires backend capabilities that support:
1. Complete removal of hardcoded option lists in the client by exposing comprehensive reference read endpoints.
2. Real-time room occupancy calculation based on target date, start time, and end time.
3. Authoritative validation and conflict detection for room bookings, practitioner overlapping sessions, and active booking protection.
4. Strict tenancy enforcement ensuring doctors only modify their own clinical schedules.

---

## 16. Changelog: Migration from Hardcoded Static Options to 100% Backend-Driven Read Endpoints

| Item | Previous Hardcoded State | New Required Backend State | Rationale & Architectural Benefit |
|---|---|---|---|
| **Poliklinik Options** | Hardcoded `kPoliOptions` list (18 static strings in frontend) | `GET /api/v1/schedules/reference/polikliniks` returning active polikliniks from database | Eliminates hardcoding; ensures clinic poliklinik additions/deactivations reflect immediately in the mobile app without app store updates. |
| **Room Options** | Hardcoded `kRoomOptions` list (17 static strings in frontend) | `GET /api/v1/schedules/reference/rooms` returning clinic rooms from database | Rooms are master clinic data; enables dynamic room naming, floor locations, and room maintenance status. |
| **Room Occupancy Status** | Hardcoded `_occupiedRoomOptions` static mock list | Dynamic query parameter `?date=...&startTime=...&endTime=...` returning `isOccupied` and `occupiedBy` | Prevents double-booking across different doctors in real time; provides conflict warnings before form submission. |
| **Practice Shifts** | Hardcoded 4 shifts in frontend (`'Dini Hari'`, `'Pagi'`, `'Siang'`, `'Malam'`) | Backend reference endpoint `GET /api/v1/schedules/reference/options` defining valid clinic shifts | Aligns mobile client with database schema (`PAGI`, `SIANG`, `MALAM`) and clinic operating policy. |
| **Time Options** | Hardcoded 24 hourly options (`kTimeOptions`) | Dynamic time slot interval options or standard 24-hr timepicker validation against clinic hours | Supports flexible appointment durations (e.g. 15/30/45/60 min increments) and prevents scheduling outside clinic operational hours. |
| **Schedule Statuses** | Hardcoded `'Menunggu'`, `'Buka'`, `'Cuti'` | Backend master lifecycle statuses | Ensures status transitions follow authoritative clinical workflow rules. |
| **Daily Target Quota** | Hardcoded default quota (8) in client | `GET /api/v1/schedules/day-settings` returning configured quota per doctor/clinic | Accommodates different quota capacities for different medical specialties and clinic policies. |

---

## 17. Open Questions

1. **Multi-Slot Session Persistence:** Does the backend persist multiple time slots inside a single session as separate database records, or as a single record with total duration?
2. **Deletion Policy with Active Bookings:** Does the backend support administrative overrides to cancel/reschedule bookings when a doctor unexpectedly deletes a session, or is deletion strictly blocked?
3. **Downstream Web Consumer Push:** Will patient bookings created via the web app trigger push notifications/WebSockets to the doctor's mobile device, or should mobile rely on pull-to-refresh?

---

## 18. Evidence

The following files and components were inspected in full to construct this manifest:
1. `packages/amanah_healthcare/lib/features/schedule/domain/amanah_schedule_model.dart` ([lines 1–576](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/domain/amanah_schedule_model.dart#L1-L576))
2. `packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_repository.dart` ([lines 1–514](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_repository.dart#L1-L514))
3. `packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_store.dart` ([lines 1–427](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_store.dart#L1-L427))
4. `packages/amanah_healthcare/lib/features/schedule/presentation/components/amanah_schedule_form_and_calendar_dialog.dart` ([lines 1–2313](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/presentation/components/amanah_schedule_form_and_calendar_dialog.dart#L1-L2313))
5. `packages/amanah_healthcare/lib/features/home/presentation/screen/amanah_schedule_tab_screen.dart` ([lines 1–774](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/home/presentation/screen/amanah_schedule_tab_screen.dart#L1-L774))
6. `packages/amanah_healthcare/lib/features/schedule/presentation/components/amanah_schedule_cards_and_drawers.dart` ([lines 1–2008](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/presentation/components/amanah_schedule_cards_and_drawers.dart#L1-L2008))
7. `packages/amanah_healthcare/lib/features/home/presentation/components/amanah_schedule_card_stack.dart` ([lines 1–1089](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/home/presentation/components/amanah_schedule_card_stack.dart#L1-L1089))
8. `packages/amanah_healthcare/test/features/schedule/amanah_schedule_repository_test.dart` ([lines 1–440](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/test/features/schedule/amanah_schedule_repository_test.dart#L1-L440))
9. `packages/amanah_healthcare/test/features/home/amanah_schedule_tab_screen_test.dart` ([lines 1–439](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/test/features/home/amanah_schedule_tab_screen_test.dart#L1-L439))
10. `D:\Amanah-healthcare-backend\src\modules\schedules\presentation\schedules.controller.ts` ([lines 1–542](file:///D:/Amanah-healthcare-backend/src/modules/schedules/presentation/schedules.controller.ts#L1-L542))

---

## 19. Traceability Matrix

| Requirement | Frontend Evidence | User Flow | Backend Capability Needed | Status |
|---|---|---|---|---|
| **Dynamic Poliklinik Options** | [amanah_schedule_form_and_calendar_dialog.dart:564-571](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/presentation/components/amanah_schedule_form_and_calendar_dialog.dart#L564-L571) | Add/Edit Schedule Drawer | `GET /api/v1/schedules/reference/polikliniks` | Implemented in backend |
| **Dynamic Room Options & Occupancy** | [amanah_schedule_form_and_calendar_dialog.dart:573-583](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/presentation/components/amanah_schedule_form_and_calendar_dialog.dart#L573-L583) | Add/Edit Schedule Drawer | `GET /api/v1/schedules/reference/rooms` with occupancy filter | Implemented in backend |
| **Doctor Schedule Query by Date** | [amanah_schedule_repository.dart:221-250](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_repository.dart#L221-L250) | Schedule Overview & Sessions | `GET /api/v1/schedules/my-schedules?date=...` | Implemented in backend |
| **Monthly Calendar Summary** | [amanah_schedule_repository.dart:252-269](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_repository.dart#L252-L269) | Big Calendar Drawer | `GET /api/v1/schedules/calendar-summary?month=...` | Implemented in backend |
| **Daily Quota & Cuti Settings** | [amanah_schedule_repository.dart:271-289](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_repository.dart#L271-L289) | Radial Gauge & Cuti Banner | `GET /api/v1/schedules/day-settings?date=...` | Implemented in backend |
| **Create Schedule Mutation** | [amanah_schedule_repository.dart:318-357](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_repository.dart#L318-L357) | Add Schedule Drawer | `POST /api/v1/schedules` | Implemented in backend |
| **Update Schedule Mutation** | [amanah_schedule_repository.dart:359-398](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_repository.dart#L359-L398) | Edit Schedule Drawer | `PATCH /api/v1/schedules/:id` | Implemented in backend |
| **Delete Schedule Mutation** | [amanah_schedule_repository.dart:419-429](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_repository.dart#L419-L429) | Edit Drawer & Session Card | `DELETE /api/v1/schedules/:id` | Implemented in backend |
| **Conflict Handling (HTTP 409)** | [amanah_schedule_repository.dart:63-68](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_repository.dart#L63-L68) | Add/Edit/Delete Form | Return 409 with specific error code payload | Implemented in backend |
| **Booked Patients by Session/Date** | [amanah_schedule_repository.dart:431-461](file:///D:/amanah-healthcare-mobile/packages/amanah_healthcare/lib/features/schedule/data/amanah_schedule_repository.dart#L431-L461) | Session Patients & Overview | `GET /api/v1/schedules/:id/booked-patients` | Implemented in backend |

---

## 20. Contract Boundary

This report describes frontend requirements and dependencies. The final API contract, endpoint design, transport details, backend validation semantics, response schema, error taxonomy, authorization model, and implementation remain backend-owned unless already established by an existing contract.
