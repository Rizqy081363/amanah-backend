# AGENTS.md Handoff Contract: Real-Time Notifications, Queue Call Lifecycle & Patient History

- **Date:** 2026-09-27
- **Contract Version:** `v1.1.0`
- **Scope:** Patient Appointments, Notification Real-Time System, Call Retry & No-Show Lifecycle, Patient Appointment History Query
- **Compatibility:** `ADDITIVE` (100% backward-compatible with existing appointment booking and user profile flows)
- **Target Consumer Clients:** Flutter Mobile App (Patient & Doctor), Next.js Web Admin & Poliklinik Staff Portal

---

## 1. Feature Overview & Purpose

### 1.1 Overview
This feature introduces industrial-grade real-time in-app notifications and appointment lifecycle tracking. It eliminates client-side polling, provides instantaneous call updates to patients waiting in clinic rooms, enforces an authoritative 3-call retry and requeue policy, and provides an isolated terminal history query for patient medical and attendance records.

### 1.2 Purpose
1. **Zero Client-Side Guesswork:** The backend is the single source of truth (SSOT) for queue positions, retry counts, requeue statuses, unread notification counts, and terminal statuses.
2. **Deterministic Lifecycle:** Guarantee that patients who do not respond to a call attempt are automatically requeued back into the waiting line up to 2 times, and marked as `no_show` on the 3rd attempt without manual state manipulation.
3. **Multi-Device State Synchronization:** Socket.IO events synchronized through Redis ensure that marking a notification read on one device immediately reflects across all active tabs, mobile devices, and unread badges.

---

## 2. Architectural Boundaries & Responsibilities

### 2.1 Backend Responsibility
The backend is solely responsible for:
1. Calculating and incrementing call attempt numbers (`attemptNumber` 1..3).
2. Determining whether an unanswered call results in a `waiting` requeue or a terminal `no_show`.
3. Generating deterministic idempotency keys for notifications (`SHA-256(sourceType + sourceId + eventType + recipientId)`) to prevent duplicate notification delivery.
4. Authoritatively computing `unreadCount` via PostgreSQL aggregations.
5. Enforcing role-based access control (RBAC) preventing patients from invoking staff call operations or querying other patients' historical records.
6. Emitting real-time domain events to Redis Streams and Socket.IO user rooms.

### 2.2 Frontend Responsibility
The frontend is responsible for:
1. Presenting UI states directly derived from the backend payload (e.g., displaying `attemptNumber` and `maxAttempts` verbatim).
2. Connecting to the Socket.IO gateway using the Bearer JWT token in the handshake.
3. Listening to `notification:new`, `notification:read`, and `notification:unread_count` downlinks to update UI badges and lists.
4. Passing query filters (`status=completed|cancelled|no_show`, `startDate`, `endDate`, `page`, `limit`) to the backend.
5. Displaying the exact empty state (`data: []`) when no historical appointments or notifications exist.

### 2.3 Frontend MUST NOT (Strict Prohibitions)
To prevent contract drift, calculation bugs, and race conditions, the frontend **MUST NOT**:
1. **MUST NOT calculate call retry attempts locally.** The client must never increment an attempt counter or assume what attempt number is next. Always render `attemptNumber` returned by the API.
2. **MUST NOT calculate or simulate queue requeuing.** The client must never move an appointment ticket or re-order lists locally based on local time or timeouts. Requeuing is decided exclusively by `POST /appointments/:id/no-show`.
3. **MUST NOT determine terminal status locally.** The client must never mark an appointment `no_show` on the client side because "the doctor waited 5 minutes". Terminal transitions happen only when the backend returns `status: "no_show"`.
4. **MUST NOT invent fake, dummy, or fallback data.** If `GET /appointments/history/me` returns `{ "data": [], "total": 0 }`, the frontend must display an empty state. It must never populate sample appointments or placeholder records.
5. **MUST NOT calculate or extrapolate unread notification counts.** The frontend must never maintain a local counter that drifts from the server. Always bind to `unreadCount` from the REST response or `notification:unread_count` Socket.IO event.
6. **MUST NOT filter historical appointments in memory.** The frontend must not download all appointments and perform `.filter(a => a.status === 'completed')` on the device. Always use the server query parameter `?status=...`.
7. **MUST NOT create duplicate or conflicting status mappings.** Canonical statuses are strictly lowercase: `'booked'`, `'waiting'`, `'in_consultation'`, `'completed'`, `'cancelled'`, `'no_show'`, `'rescheduled'`.

---

## 3. Real-Time Socket.IO Contract

### 3.1 Connection & Handshake Authentication
- **Gateway Path:** `/socket.io`
- **Supported Transports:** `['websocket', 'polling']`
- **Handshake Authentication:** Bearer JWT passed via:
  1. Handshake `auth`: `{ "token": "<JWT_ACCESS_TOKEN>" }`
  2. Handshake `headers`: `{ "authorization": "Bearer <JWT_ACCESS_TOKEN>" }`
- **Client Room:** Sockets automatically join private room `user:<userId>`.

### 3.2 Downlink Events (Server -> Client)

#### Event: `notification:new`
Emitted immediately when a new notification is delivered to the user.
```json
{
  "id": "7913576e-55f3-4ee1-9d8c-eb02e77e6f8e",
  "category": "appointment",
  "title": "Panggilan Antrean Pasien",
  "senderName": "staff",
  "senderRole": "staff",
  "badgeIcon": "bell",
  "metaIcon": null,
  "visualKey": null,
  "body": "Nomor antrean P-002 dipanggil ke Pemeriksaan Umum. Panggilan ke-1 dari 3. Silakan segera menuju ruang periksa.",
  "isUrgent": true,
  "sourceType": "appointment",
  "sourceId": "b4a6fd9d-217d-4038-9a0b-1d2d96e5cf2d",
  "metadata": {
    "appointmentId": "b4a6fd9d-217d-4038-9a0b-1d2d96e5cf2d",
    "attemptNumber": 1,
    "maxAttempts": 3
  },
  "isRead": false,
  "createdAt": "2026-09-27T06:54:21.910Z"
}
```

#### Event: `notification:read`
Emitted when notifications are marked read, allowing cross-device synchronization.
```json
// Single notification read
{
  "id": "7913576e-55f3-4ee1-9d8c-eb02e77e6f8e",
  "readAt": "2026-09-27T06:55:00.000Z"
}

// All notifications read
{
  "all": true,
  "readAt": "2026-09-27T06:55:00.000Z"
}
```

#### Event: `notification:unread_count`
Emitted whenever the user's unread counter changes.
```json
{
  "unreadCount": 0
}
```

---

## 4. REST API Endpoint Specifications

### 4.1 Staff: Call Patient
`POST /api/v1/appointments/:id/call`

- **Purpose:** Initiates a call attempt for a patient waiting in line. Mints a call attempt record, updates the ticket, and pushes real-time alerts.
- **Authentication:** Required (`Bearer <JWT>`).
- **Authorization:** `ADMIN`, `STAF` (Doctors & Clinic Nurses). Patients receive `403 Forbidden`.
- **Path Parameters:**
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `id` | UUID | Yes | UUID of the appointment |
- **Request Body (JSON):**
  ```json
  {
    "notes": "Panggilan ke-1 melalui loket poli"
  }
  ```
- **Validation Rules:**
  - `id` must be a valid UUID v4 format (otherwise `400 Bad Request`).
  - `notes` is optional string (max 500 chars).
  - Appointment must be in `waiting` or `booked` status.
  - Previous call attempts must be `< 3`.
- **Success Response (200 OK):**
  ```json
  {
    "attemptNumber": 1,
    "maxAttempts": 3,
    "status": "called"
  }
  ```
- **Response Contract Table:**
  | Field | Type | Nullable | Description | Backend Generated |
  |---|---|---|---|---|
  | `attemptNumber` | number (int) | No | Current attempt number (1, 2, or 3) | Yes |
  | `maxAttempts` | number (int) | No | Configured maximum attempts (constant: 3) | Yes |
  | `status` | string | No | Current call state (`called`) | Yes |
- **Error Responses:**
  - `400 Bad Request`: `Janji temu sudah mencapai batas maksimal 3 kali panggilan.`
  - `401 Unauthorized`: Session token is invalid or missing.
  - `403 Forbidden`: User does not hold `ADMIN` or `STAF` role.
  - `404 Not Found`: Appointment does not exist.

---

### 4.2 Staff: Confirm Patient Response
`POST /api/v1/appointments/:id/respond`

- **Purpose:** Acknowledges that the patient arrived in the consultation room. Transitions appointment to `in_consultation`.
- **Authentication:** Required (`Bearer <JWT>`).
- **Authorization:** `ADMIN`, `STAF`.
- **Path Parameters:** `id` (UUID).
- **Success Response (200 OK):**
  ```json
  {
    "status": "in_consultation",
    "respondedAt": "2026-09-27T06:58:00.000Z"
  }
  ```

---

### 4.3 Staff: Mark No-Show (Requeue or Terminal)
`POST /api/v1/appointments/:id/no-show`

- **Purpose:** Handles an unanswered call. If attempts < 3, requeues the patient back into `waiting`. If attempt = 3, marks the appointment terminal `no_show`.
- **Authentication:** Required (`Bearer <JWT>`).
- **Authorization:** `ADMIN`, `STAF`.
- **Path Parameters:** `id` (UUID).
- **Request Body (JSON):**
  ```json
  {
    "notes": "Pasien tidak menyahut setelah dipanggil"
  }
  ```
- **Success Response (200 OK - Attempts 1 or 2, Requeued):**
  ```json
  {
    "requeued": true,
    "remainingAttempts": 2,
    "status": "waiting"
  }
  ```
- **Success Response (200 OK - Attempt 3, Terminal No-Show):**
  ```json
  {
    "noShow": true,
    "status": "no_show"
  }
  ```
- **Response Contract Table:**
  | Field | Type | Nullable | Description | Backend Generated |
  |---|---|---|---|---|
  | `requeued` | boolean | Yes | `true` if requeued to waiting line | Yes |
  | `remainingAttempts` | number | Yes | Remaining attempts before terminal cancellation | Yes |
  | `noShow` | boolean | Yes | `true` if permanently closed as no_show | Yes |
  | `status` | string | No | New status (`waiting` or `no_show`) | Yes |

---

### 4.4 Get Call Attempts Audit Log
`GET /api/v1/appointments/:id/call-attempts`

- **Purpose:** Retrieves audit log of all call attempts made for an appointment.
- **Authentication:** Required.
- **Authorization:** `ADMIN`, `STAF`, `PATIENT`.
- **Path Parameters:** `id` (UUID).
- **Success Response (200 OK):**
  ```json
  [
    {
      "id": "3c02aa07-8ec9-436f-b258-3d122e232497",
      "appointmentId": "96ed76ea-c1af-4920-9352-edee1a416033",
      "attemptNumber": 1,
      "calledAt": "2026-09-27T07:00:00.000Z",
      "status": "no_response",
      "notes": "Panggilan pertama"
    }
  ]
  ```

---

### 4.5 Patient: Query Own History (Mobile App)
`GET /api/v1/appointments/history/me`

- **Purpose:** Fetches terminal appointments (`completed`, `cancelled`, `no_show`) for the logged-in patient.
- **Authentication:** Required (`Bearer <JWT>`).
- **Authorization:** `PATIENT`.
- **Query Parameters:**
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `status` | string | No | (all terminal) | Filter by `completed`, `cancelled`, or `no_show` |
  | `startDate` | string | No | null | Format `YYYY-MM-DD` |
  | `endDate` | string | No | null | Format `YYYY-MM-DD` |
  | `page` | integer | No | 1 | Page number |
  | `limit` | integer | No | 20 | Page size (max 100) |
- **Success Response (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "96ed76ea-c1af-4920-9352-edee1a416033",
        "bookingCode": "BK-VAL-NOSHOW-02",
        "status": "no_show",
        "scheduledDate": "2026-09-28",
        "scheduledStartTime": "08:00:00",
        "scheduledEndTime": "08:30:00",
        "poliklinikName": "Poli Umum",
        "doctorName": "dr. Zikri Ahmad, Sp.A",
        "complaint": "E2E Lifecycle Call & Retry Test",
        "callAttemptsCount": 3,
        "completedAt": null,
        "cancelledAt": "2026-09-27T07:01:00.000Z",
        "cancelReason": "Pasien tidak hadir setelah 3x panggilan",
        "updatedAt": "2026-09-27T07:01:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
  ```
- **Empty State Response (200 OK):**
  ```json
  {
    "data": [],
    "total": 0,
    "page": 1,
    "limit": 20,
    "totalPages": 0
  }
  ```

---

### 4.6 Staff: Query Patient History by ID
`GET /api/v1/appointments/history/patient/:patientId`

- **Purpose:** Enables clinic doctors and staff to review any patient's attendance track record and terminal appointment history.
- **Authentication:** Required (`Bearer <JWT>`).
- **Authorization:** `ADMIN`, `STAF`. Unauthorized patient access is blocked with `403 Forbidden`.
- **Path Parameters:** `patientId` (UUID).
- **Query Parameters & Response Shape:** Identical to `/history/me`.

---

### 4.7 Notifications: Get Unread Count
`GET /api/v1/notifications/unread-count`

- **Purpose:** High-speed lightweight endpoint for rendering the notification bell badge.
- **Authentication:** Required.
- **Success Response (200 OK):**
  ```json
  {
    "unreadCount": 3
  }
  ```

---

### 4.8 Notifications: List User Notifications
`GET /api/v1/notifications/me`

- **Purpose:** Retrieves paginated notification feed for the current user.
- **Authentication:** Required.
- **Query Parameters:** `page` (default: 1), `limit` (default: 20), `unreadOnly` (boolean).
- **Success Response (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "7913576e-55f3-4ee1-9d8c-eb02e77e6f8e",
        "category": "appointment",
        "title": "Panggilan Antrean Pasien",
        "senderName": "staff",
        "senderRole": "staff",
        "badgeIcon": "bell",
        "body": "Nomor antrean P-002 dipanggil ke Pemeriksaan Umum...",
        "isUrgent": true,
        "sourceType": "appointment",
        "sourceId": "b4a6fd9d-217d-4038-9a0b-1d2d96e5cf2d",
        "isRead": false,
        "createdAt": "2026-09-27T06:54:21.910Z"
      }
    ],
    "total": 1,
    "unreadCount": 1
  }
  ```

---

### 4.9 Notifications: Mark Single / All as Read
- `PATCH /api/v1/notifications/:id/read`
- `PATCH /api/v1/notifications/read-all`
- **Success Response (200 OK):**
  ```json
  {
    "success": true
  }
  ```
  *(Simultaneously broadcasts real-time Socket.IO downlinks to all connected sessions for this user)*.

---

## 5. Verification Script & Concrete Evidence

### 5.1 PowerShell Test Suite Script Verbatim
Path: [`scripts/e2e/test-notification-lifecycle-endpoints.ps1`](file:///D:/Amanah-healthcare-backend/scripts/e2e/test-notification-lifecycle-endpoints.ps1)

```powershell
# ==============================================================================
# AMANAH HEALTHCARE - NOTIFICATION & APPOINTMENT LIFECYCLE E2E TEST SUITE
# Hardening, Security, Authorization, and Full Lifecycle Functional Verification
# ==============================================================================

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"
$baseUrl = Get-E2EBaseUrl
$passed = 0
$failed = 0

function Assert-Test([string]$name, [bool]$condition, [string]$details = "") {
    if ($condition) {
        Write-Host " [PASS] $name" -ForegroundColor Green
        $global:passed++
    } else {
        Write-Host " [FAIL] $name - $details" -ForegroundColor Red
        $global:failed++
    }
}

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " Amanah Healthcare: E2E Notification & Appointment Lifecycle Verification" -ForegroundColor Cyan
Write-Host " Target API: $baseUrl" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# Ensure API is ready
Wait-E2EApiReady $baseUrl 60
Write-Host "API is healthy and ready.`n" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 1. AUTHENTICATION & ROLE ACQUISITION
# ------------------------------------------------------------------------------
Write-Host "=== 1. Authentication & Role Acquisition ===" -ForegroundColor Cyan

# 1.1 Admin
$adminAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"
$adminToken = $adminAuth.token
$adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
Assert-Test "Admin Login (admin@amanah.com)" ($null -ne $adminToken -and $adminToken.Length -gt 20)

# 1.2 Staff / Doctor
$doctorAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{
    email = "dokter@amanah.com"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"
$doctorToken = $doctorAuth.token
$doctorHeaders = @{ "Authorization" = "Bearer $doctorToken" }
Assert-Test "Doctor Login (dokter@amanah.com)" ($null -ne $doctorToken -and $doctorToken.Length -gt 20)

# 1.3 Patient
$patientAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{
    email = "patient.0004@amanah-healthcare.test"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"
$patientToken = $patientAuth.token
$patientHeaders = @{ "Authorization" = "Bearer $patientToken" }
Assert-Test "Patient Login (patient.0004@amanah-healthcare.test)" ($null -ne $patientToken -and $patientToken.Length -gt 20)

# ------------------------------------------------------------------------------
# 2. SECURITY HARDENING & AUTHORIZATION NEGATIVE TESTS
# ------------------------------------------------------------------------------
Write-Host "`n=== 2. Security Hardening & Authorization Controls ===" -ForegroundColor Cyan

# 2.1 Missing Token -> 401 Unauthorized
$unauthNotifications = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/me" -Method Get
} catch {
    $unauthNotifications = $_.Exception.Response.StatusCode.value__ -eq 401
}
Assert-Test "Security: Anonymous request to /notifications/me returns 401" $unauthNotifications

$unauthHistory = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/history/me" -Method Get
} catch {
    $unauthHistory = $_.Exception.Response.StatusCode.value__ -eq 401
}
Assert-Test "Security: Anonymous request to /appointments/history/me returns 401" $unauthHistory

$unauthCall = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/00000000-0000-0000-0000-000000000001/call" -Method Post
} catch {
    $unauthCall = $_.Exception.Response.StatusCode.value__ -eq 401
}
Assert-Test "Security: Anonymous request to /appointments/:id/call returns 401" $unauthCall

# 2.2 Patient Forbidden on Staff/Doctor Call Operations -> 403 Forbidden
$patientForbiddenCall = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/00000000-0000-0000-0000-000000000001/call" -Method Post -Headers $patientHeaders
} catch {
    $patientForbiddenCall = $_.Exception.Response.StatusCode.value__ -eq 403
}
Assert-Test "Security: Patient role calling /appointments/:id/call returns 403 Forbidden" $patientForbiddenCall

$patientForbiddenNoShow = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/00000000-0000-0000-0000-000000000001/no-show" -Method Post -Headers $patientHeaders
} catch {
    $patientForbiddenNoShow = $_.Exception.Response.StatusCode.value__ -eq 403
}
Assert-Test "Security: Patient role calling /appointments/:id/no-show returns 403 Forbidden" $patientForbiddenNoShow

$patientForbiddenCrossHistory = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/history/patient/00000000-0000-0000-0000-000000000001" -Method Get -Headers $patientHeaders
} catch {
    $patientForbiddenCrossHistory = $_.Exception.Response.StatusCode.value__ -eq 403
}
Assert-Test "Security: Patient querying another patient's history endpoint returns 403 Forbidden" $patientForbiddenCrossHistory

# 2.3 Input Validation Hardening -> 400 Bad Request on invalid UUIDs
$invalidUuidCall = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/invalid-uuid-string/call" -Method Post -Headers $doctorHeaders
} catch {
    $invalidUuidCall = $_.Exception.Response.StatusCode.value__ -eq 400
}
Assert-Test "Validation: Non-UUID appointment id on /call rejected with 400 Bad Request" $invalidUuidCall

$invalidUuidNotifRead = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/invalid-uuid-string/read" -Method Patch -Headers $patientHeaders
} catch {
    $invalidUuidNotifRead = $_.Exception.Response.StatusCode.value__ -eq 400
}
Assert-Test "Validation: Non-UUID notification id on /read rejected with 400 Bad Request" $invalidUuidNotifRead

# ------------------------------------------------------------------------------
# 3. APPOINTMENT CALL RETRY & NO-SHOW LIFECYCLE (US-004 & RETRY POLICY)
# ------------------------------------------------------------------------------
Write-Host "`n=== 3. Appointment Call Retry & No-Show Lifecycle ===" -ForegroundColor Cyan

# 3.1 Setup fresh appointment for patient
$clinics = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics" -Method Get -Headers $doctorHeaders
$poliklinikId = $clinics[0].id
$layananList = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/$poliklinikId/layanan" -Method Get -Headers $doctorHeaders
$layananId = $layananList[0].id

# Resolve Patient Profile ID
$patientMe = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/me" -Method Get -Headers $patientHeaders
$patientProfileId = $patientMe.id

$createAptBody = @{
    poliklinikId = $poliklinikId
    layananId = $layananId
    complaint = "E2E Lifecycle Call & Retry Test"
    appointmentDate = (Get-Date).AddDays(2).ToString("yyyy-MM-dd")
    session = "PAGI"
} | ConvertTo-Json

$createdApt = $null
try {
    $createdApt = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments" -Method Post -Body $createAptBody -ContentType "application/json" -Headers $patientHeaders
} catch {
    $allApts = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments?limit=10" -Method Get -Headers $doctorHeaders
    $createdApt = $allApts.data | Where-Object { $_.status -in @('booked', 'waiting', 'SUDAH_BUAT_JANJI', 'MENUNGGU') } | Select-Object -First 1
}

$aptId = $createdApt.id
Assert-Test "Target appointment acquired for lifecycle testing ($aptId)" ($null -ne $aptId)

# 3.2 Attempt 1: Call Patient
$call1 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Body (@{ notes = "Panggilan ke-1 melalui E2E" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Call Attempt 1: Returns attemptNumber = 1" ($call1.attemptNumber -eq 1)
Assert-Test "Call Attempt 1: Returns maxAttempts = 3" ($call1.maxAttempts -eq 3)
Assert-Test "Call Attempt 1: Returns status = called" ($call1.status -eq "called")

# Verify call attempts query
$attemptsAfter1 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call-attempts" -Method Get -Headers $doctorHeaders
Assert-Test "Query call-attempts has 1 attempt record" ($attemptsAfter1.Count -ge 1)

# 3.3 Attempt 1 Unanswered -> Mark No-Show (triggers Requeue)
$noShow1 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/no-show" -Method Post -Body (@{ notes = "Pasien tidak merespons panggilan 1" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Unanswered Attempt 1: Requeued = true" ($noShow1.requeued -eq $true)
Assert-Test "Unanswered Attempt 1: RemainingAttempts = 2" ($noShow1.remainingAttempts -eq 2)
Assert-Test "Unanswered Attempt 1: Status returns to waiting" ($noShow1.status -eq "waiting")

# 3.4 Attempt 2: Call Patient
$call2 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Body (@{ notes = "Panggilan ke-2 setelah requeue" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Call Attempt 2: Returns attemptNumber = 2" ($call2.attemptNumber -eq 2)

# 3.5 Attempt 2 Unanswered -> Mark No-Show (triggers 2nd Requeue)
$noShow2 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/no-show" -Method Post -Body (@{ notes = "Pasien tidak merespons panggilan 2" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Unanswered Attempt 2: Requeued = true" ($noShow2.requeued -eq $true)
Assert-Test "Unanswered Attempt 2: RemainingAttempts = 1" ($noShow2.remainingAttempts -eq 1)

# 3.6 Attempt 3: Call Patient (Final attempt)
$call3 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Body (@{ notes = "Panggilan ke-3 batas akhir" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Call Attempt 3: Returns attemptNumber = 3" ($call3.attemptNumber -eq 3)

# 3.7 Attempt 3 Unanswered -> Terminal NO_SHOW
$noShow3 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/no-show" -Method Post -Body (@{ notes = "Pasien tidak hadir setelah 3x panggilan" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Unanswered Attempt 3: Terminal noShow = true" ($noShow3.noShow -eq $true)
Assert-Test "Unanswered Attempt 3: Terminal status is 'no_show'" ($noShow3.status -eq "no_show")

# 3.8 Call after Terminal Status is Rejected (Guard Policy)
$rejectedCallAfterTerminal = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Headers $doctorHeaders
} catch {
    $rejectedCallAfterTerminal = $_.Exception.Response.StatusCode.value__ -eq 400
}
Assert-Test "Lifecycle Policy: Calling terminal no_show appointment rejected with 400 Bad Request" $rejectedCallAfterTerminal

# ------------------------------------------------------------------------------
# 4. PATIENT APPOINTMENT HISTORY API (US-001, US-002)
# ------------------------------------------------------------------------------
Write-Host "`n=== 4. Patient Appointment History API ===" -ForegroundColor Cyan

# 4.1 Patient queries own history
$historyMe = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/history/me" -Method Get -Headers $patientHeaders
Assert-Test "GET /appointments/history/me returns valid structure" ($null -ne $historyMe.data -and $null -ne $historyMe.total)
Assert-Test "History includes terminal appointments" ($historyMe.data.Count -gt 0)

# Verify terminal statuses in history
$validStatuses = @('completed', 'no_show', 'cancelled')
$allStatusesTerminal = $true
foreach ($item in $historyMe.data) {
    if ($item.status -notin $validStatuses) {
        $allStatusesTerminal = $false
        break
    }
}
Assert-Test "All returned history records have terminal status (completed, no_show, cancelled)" $allStatusesTerminal

# Verify our 3-attempt no_show appointment is present with callAttemptsCount = 3
$testedAptInHistory = $historyMe.data | Where-Object { $_.id -eq $aptId }
Assert-Test "Newly terminal no_show appointment ($aptId) present in history" ($null -ne $testedAptInHistory)
if ($testedAptInHistory) {
    Assert-Test "History record includes callAttemptsCount = 3" ($testedAptInHistory.callAttemptsCount -eq 3)
}

# 4.2 Status filtering on history
$noShowFilter = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/history/me?status=no_show" -Method Get -Headers $patientHeaders
$allFilteredNoShow = $true
foreach ($item in $noShowFilter.data) {
    if ($item.status -ne 'no_show') { $allFilteredNoShow = $false; break }
}
Assert-Test "Status filter '?status=no_show' returns only no_show records" ($allFilteredNoShow -and $noShowFilter.data.Count -gt 0)

# 4.3 Doctor / Admin queries patient history by ID (US-002 Consistency)
$doctorViewOfHistory = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/history/patient/$patientProfileId" -Method Get -Headers $doctorHeaders
Assert-Test "Doctor GET /appointments/history/patient/:patientId returns identical count as patient" ($doctorViewOfHistory.total -eq $historyMe.total)

# ------------------------------------------------------------------------------
# 5. NOTIFICATION INFRASTRUCTURE & SYNC ENDPOINTS
# ------------------------------------------------------------------------------
Write-Host "`n=== 5. Notification Infrastructure & Sync Endpoints ===" -ForegroundColor Cyan

# 5.1 Unread count for patient
$unreadCount = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/unread-count" -Method Get -Headers $patientHeaders
Assert-Test "GET /notifications/unread-count returns integer count" ($null -ne $unreadCount.unreadCount -and $unreadCount.unreadCount -ge 0)

# 5.2 List patient notifications
$patientNotifs = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/me?limit=10" -Method Get -Headers $patientHeaders
Assert-Test "GET /notifications/me returns notifications array" ($null -ne $patientNotifs.data)

# 5.3 Mark single notification as read (if exists)
if ($patientNotifs.data.Count -gt 0) {
    $firstNotif = $patientNotifs.data[0]
    $markSingle = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/$($firstNotif.id)/read" -Method Patch -Headers $patientHeaders
    Assert-Test "PATCH /notifications/:id/read returns success = true" ($markSingle.success -eq $true)
}

# 5.4 Mark all notifications as read
$markAll = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/read-all" -Method Patch -Headers $patientHeaders
Assert-Test "PATCH /notifications/read-all returns success = true" ($markAll.success -eq $true)

# 5.5 Verify unread count is exactly 0
$unreadCountAfter = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/unread-count" -Method Get -Headers $patientHeaders
Assert-Test "Unread notifications count is verified 0 after read-all" ($unreadCountAfter.unreadCount -eq 0)

# ------------------------------------------------------------------------------
# SUMMARY & VERIFICATION
# ------------------------------------------------------------------------------
Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " Lifecycle & Notification Suite Results: Passed = $passed, Failed = $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
```

### 5.2 Verified Execution Console Output Verbatim
```text
==============================================================================
 Amanah Healthcare: E2E Notification & Appointment Lifecycle Verification
 Target API: http://localhost:3001
==============================================================================
API is healthy and ready.

=== 1. Authentication & Role Acquisition ===
 [PASS] Admin Login (admin@amanah.com)
 [PASS] Doctor Login (dokter@amanah.com)
 [PASS] Patient Login (patient.0004@amanah-healthcare.test)

=== 2. Security Hardening & Authorization Controls ===
 [PASS] Security: Anonymous request to /notifications/me returns 401
 [PASS] Security: Anonymous request to /appointments/history/me returns 401
 [PASS] Security: Anonymous request to /appointments/:id/call returns 401
 [PASS] Security: Patient role calling /appointments/:id/call returns 403 Forbidden
 [PASS] Security: Patient role calling /appointments/:id/no-show returns 403 Forbidden
 [PASS] Security: Patient querying another patient's history endpoint returns 403 Forbidden
 [PASS] Validation: Non-UUID appointment id on /call rejected with 400 Bad Request
 [PASS] Validation: Non-UUID notification id on /read rejected with 400 Bad Request

=== 3. Appointment Call Retry & No-Show Lifecycle ===
 [PASS] Target appointment acquired for lifecycle testing (96ed76ea-c1af-4920-9352-edee1a416033)
 [PASS] Call Attempt 1: Returns attemptNumber = 1
 [PASS] Call Attempt 1: Returns maxAttempts = 3
 [PASS] Call Attempt 1: Returns status = called
 [PASS] Query call-attempts has 1 attempt record
 [PASS] Unanswered Attempt 1: Requeued = true
 [PASS] Unanswered Attempt 1: RemainingAttempts = 2
 [PASS] Unanswered Attempt 1: Status returns to waiting
 [PASS] Call Attempt 2: Returns attemptNumber = 2
 [PASS] Unanswered Attempt 2: Requeued = true
 [PASS] Unanswered Attempt 2: RemainingAttempts = 1
 [PASS] Call Attempt 3: Returns attemptNumber = 3
 [PASS] Unanswered Attempt 3: Terminal noShow = true
 [PASS] Unanswered Attempt 3: Terminal status is 'no_show'
 [PASS] Lifecycle Policy: Calling terminal no_show appointment rejected with 400 Bad Request

=== 4. Patient Appointment History API ===
 [PASS] GET /appointments/history/me returns valid structure
 [PASS] History includes terminal appointments
 [PASS] All returned history records have terminal status (completed, no_show, cancelled)
 [PASS] Newly terminal no_show appointment (96ed76ea-c1af-4920-9352-edee1a416033) present in history
 [PASS] History record includes callAttemptsCount = 3
 [PASS] Status filter '?status=no_show' returns only no_show records
 [PASS] Doctor GET /appointments/history/patient/:patientId returns identical count as patient

=== 5. Notification Infrastructure & Sync Endpoints ===
 [PASS] GET /notifications/unread-count returns integer count
 [PASS] GET /notifications/me returns notifications array
 [PASS] PATCH /notifications/:id/read returns success = true
 [PASS] PATCH /notifications/read-all returns success = true
 [PASS] Unread notifications count is verified 0 after read-all

==============================================================================
 Lifecycle & Notification Suite Results: Passed = 38, Failed = 0
==============================================================================
```

---

## 6. Frontend Handoff Specification

### 6.1 Consume Directly From Backend
The frontend must consume the following fields directly from API payloads without recalculation:
- `attemptNumber`: Authoritative attempt number.
- `maxAttempts`: Maximum attempt threshold (constant: 3).
- `remainingAttempts`: Number of retry chances remaining before terminal cancellation.
- `requeued`: Boolean flag indicating whether the appointment was placed back in the waiting queue.
- `callAttemptsCount`: The aggregate number of calls made for this historical appointment.
- `unreadCount`: The authoritative count of unread notifications for badge display.
- `isUrgent`: Boolean indicating whether a sound, high-priority banner, or vibration should trigger on mobile.

### 6.2 Do Not Reimplement in Frontend
The frontend MUST NOT implement:
- **Retry Logic:** Never compute "if (calls >= 3) { status = 'no_show' }". The backend handles this transition.
- **Queue Position / Requeue Simulation:** Never rearrange the client queue array locally after an unanswered call. Wait for the updated list from `GET /appointments` or WebSocket invalidation.
- **Status Normalization:** Never invent capitalized or Indonesian statuses like `BATAL`, `SELESAI`, `TIDAK_HADIR` in API requests. Always use lowercase enum values: `completed`, `cancelled`, `no_show`.
- **In-Memory Filtering:** Do not download all historical visits and filter in Dart/JavaScript. Use the query parameter `?status=...`.

### 6.3 Required Frontend Models

#### TypeScript / Dart Enums
```typescript
export enum TerminalAppointmentStatus {
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

export enum CallAttemptStatus {
  CALLED = 'called',
  RESPONDED = 'responded',
  NO_RESPONSE = 'no_response',
}
```

```dart
enum TerminalAppointmentStatus {
  completed,
  cancelled,
  no_show,
}

enum CallAttemptStatus {
  called,
  responded,
  no_response,
}
```

### 6.4 Expected UI Behavior
- **On `POST /call`:** Display "Memanggil Pasien (Panggilan X dari 3)".
- **On `POST /no-show` (requeued = true):** Display toast: "Pasien tidak menjawab, antrean dimundurkan (Sisa panggilan: X)". Status badge stays "Menunggu".
- **On `POST /no-show` (noShow = true):** Display modal: "Batas 3 kali panggilan terlampaui. Status janji temu ditandai Tidak Hadir (No-Show)".
- **On `notification:new` (isUrgent = true):** Trigger heads-up notification dialog with primary action button leading to `/appointments/:sourceId`.
- **On Empty History (`data: []`):** Show empty state illustration: "Belum Ada Riwayat Kunjungan". Do not show error toasts or mock data.
