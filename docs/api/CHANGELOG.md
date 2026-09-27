# API Changelog

## [2026-09-27] - Real-Time Notifications & Queue Call Lifecycle

### Added
- `POST /api/v1/appointments/:id/call`: Call patient for consultation (attempt 1..3).
- `POST /api/v1/appointments/:id/respond`: Confirm patient presence in consultation room.
- `POST /api/v1/appointments/:id/no-show`: Requeue unanswered patient (attempts 1..2) or transition to terminal `no_show` (attempt 3).
- `GET /api/v1/appointments/:id/call-attempts`: Retrieve call audit trail.
- `GET /api/v1/appointments/history/me`: Retrieve terminal appointment history (`completed`, `cancelled`, `no_show`) for logged-in patient with `callAttemptsCount`.
- `GET /api/v1/appointments/history/patient/:patientId`: Staff-only patient appointment history lookup.
- `GET /api/v1/notifications/unread-count`: Lightweight badge count.
- `PATCH /api/v1/notifications/:id/read` & `PATCH /api/v1/notifications/read-all`: Mark notifications read with multi-device Socket.IO event emission.
- Real-Time Socket.IO Gateway (`/socket.io`) emitting:
  - `notification:new`
  - `notification:read`
  - `notification:unread_count`

### Frontend Impact & Rules
- **DO NOT recalculate retry attempts:** Always consume `attemptNumber`, `remainingAttempts`, and `maxAttempts` from backend responses.
- **DO NOT simulate queue requeues locally:** Consume updated queue positions from the backend.
- **DO NOT invent fake/dummy data:** Display documented empty state when `total: 0` and `data: []`.
- **DO NOT filter in memory:** Use server-side query parameter `?status=completed|cancelled|no_show`.
- **Sync unread count:** Update badge counts authoritatively via `unreadCount`.

### Verification Suite
- Comprehensive PowerShell E2E test suite: [`scripts/e2e/test-notification-lifecycle-endpoints.ps1`](file:///D:/Amanah-healthcare-backend/scripts/e2e/test-notification-lifecycle-endpoints.ps1) (Passed: 38, Failed: 0).
- Unit test suite: 42 passed across 13 test files.
- Full contract documentation: [`docs/api-changelog/2026-09-27-notification-and-patient-history-contracts.md`](file:///D:/Amanah-healthcare-backend/docs/api-changelog/2026-09-27-notification-and-patient-history-contracts.md).
