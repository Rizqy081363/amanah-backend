# API Contract: Real-Time Notifications, Queue Call Lifecycle & Patient History

## 1. Overview
This contract defines the API specifications, real-time Socket.IO events, and data structures for the real-time notification infrastructure, patient queue call retry/requeue lifecycle, and patient appointment history querying.

## 2. Source of Truth
The backend is the authoritative source of truth for:
- All status transitions (`booked` -> `waiting` -> `called` -> `in_consultation` | `waiting` (requeued) -> `no_show` | `completed`).
- Call attempt counters (`attemptNumber` 1..3, `remainingAttempts`, `maxAttempts: 3`).
- Notification unread counters and read status states.
- Terminal appointment history aggregation (`callAttemptsCount`).

The frontend is a consumer of this contract. The frontend MUST NOT calculate, recalculate, or extrapolate these states.

---

## 3. Endpoints Summary

| Method | Endpoint | Role Allowed | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/appointments/:id/call` | `ADMIN`, `STAF` | Call patient (attempt 1..3) |
| `POST` | `/api/v1/appointments/:id/respond` | `ADMIN`, `STAF` | Confirm patient entered room |
| `POST` | `/api/v1/appointments/:id/no-show` | `ADMIN`, `STAF` | Requeue or mark terminal no-show |
| `GET` | `/api/v1/appointments/:id/call-attempts` | `ADMIN`, `STAF`, `PATIENT` | Audit log of call attempts |
| `GET` | `/api/v1/appointments/history/me` | `PATIENT` | Patient's own terminal history |
| `GET` | `/api/v1/appointments/history/patient/:patientId` | `ADMIN`, `STAF` | Staff query of patient history |
| `GET` | `/api/v1/notifications/unread-count` | Authenticated | Badge counter |
| `GET` | `/api/v1/notifications/me` | Authenticated | User notification feed |
| `PATCH` | `/api/v1/notifications/:id/read` | Authenticated | Mark one notification read |
| `PATCH` | `/api/v1/notifications/read-all` | Authenticated | Mark all notifications read |
| `WS` | `/socket.io` | Authenticated | Real-time downlink events |

---

## 4. Frontend Mandatory Rules

1. **NO Local Attempt Calculation:** Consume `attemptNumber` from the response. Do not maintain a local integer.
2. **NO Queue Requeue Calculation:** Do not manipulate the queue array locally when a patient does not answer. The backend re-sequences tickets.
3. **NO Status Invention:** Allowed terminal statuses are strictly: `completed`, `cancelled`, `no_show`.
4. **NO Dummy Data on Empty States:** Render empty illustrations when `data: []` and `total: 0`. Never inject fallback mock items.
5. **Authoritative Unread Count:** Bind UI badges to `unreadCount`. Reconcile via `GET /notifications/unread-count` upon app resume or socket reconnect.
