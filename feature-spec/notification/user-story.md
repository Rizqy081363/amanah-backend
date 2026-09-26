# Patient Appointment Lifecycle, Notification, and History
raw:coba kamu jadikan user story dan backend thinking professional maka bagaimana hasil narasi nya jadikan spect kit requirenment Oke, jadi di sini Anda sebagai backend itu harus provide kebutuhannya klien-klien kita ya. Oke. Ini saya bilang ke Anda ya, karena admin dan juga si dokter itu bisa schedule management yang sama. Jadi mereka lagi ngebuat halaman history untuk history pasien. Nah, saya nggak ngerti idealnya seperti apa. Yang penting DB-driven adalah single source of truth, atau cuma backend endpoint saja yang menyediakan logic filtering-nya, gitu. Idealnya kan history itu dibuatkan database atau dibuatkan tabel ya. Jadi keperluan mereka itu adalah untuk history pasien yang pertama udah selesai, selesai diproses. Jadi statusnya itu gini aja lah, nggak usah ribet gitu ya. Kan kalau udah selesai masa aktifnya, contoh nih, misalkan si dokter itu ngebuat jadwal di sesi pagi hari misalkan jam 7 sampai jam 7.30. Karena kan penambahan intervalnya kan 30 menit, itu di-drive oleh metrics schedule policy 30 menit. Itu nggak bisa diganggu-gugat. Itu bukan hard coding juga. Nah, oke kembali lagi. Katakanlah ada satu orang nih, pasien yang nge-booking dia, gitu kan. Nah, ternyata dia nggak datang gitu loh. Dia nggak hadir di situ. Jadi statusnya ya itu tadi ya. Kayaknya udah ada, tapi saya nggak ngerti ya gimana. Yang penting endpoint untuk history harus ada, gitu. Harusnya kan dia kalau udah lewat dari masa itu, ya udah. Dia telat, gitu kan. Statusnya telat. Kemudian kalau dia selesai, artinya tuh ya udah diproses, udah di settlement lah sama si dokternya. Udah diproses dia, gitu. Udah diproses, kayak gitu kan. Artinya dia datang, konsult sama dokter. Jadi di Flutter itu, di Flutter itu dia ada mekanisme panggil pasien, gitu ya kan. Panggil pasien. Panggil pasien. Nah, panggil pasien. Kalau udah dipanggil pasiennya dan pasiennya udah ada, masuk, artinya kan udah settlement tuh. Maka statusnya selesai. Bukan telat, gitu. Telat itu artinya dia itu udah nge-booking, tapi dia malah nggak datang, gitu loh. Makanya dia telat, karena jadwalnya udah lewat dan di Flutter Mobile udah memanggil, tapi dia nggak kunjung datang. Ya udah, dia nggak, apa namanya, jadi dia nggak datang, gitu loh. Dan harusnya juga, terus kan pertanyaannya gini kan, pertanyaannya ada toleransi nggak? Misalkan dia nggak datang nih pas dipanggil, dia nggak datang, gitu kan. Pas dipanggil dia malah nggak datang. Nah itu toleransinya gimana? gitu. Ya dia harusnya ya udah nggak ada toleransi, gitu. Nggak ada toleransi sedikit pun, karena kan dia udah nggak datang-datang, gitu. Tapi rasanya tuh kayak aneh aja gitu. Harusnya ada threshold. Kalau tiga kali dia nggak datang, maka ya udah dia di-claim sebagai telat. Jadi kita sebagai backend itu nggak ribet-ribet lah ya, nggak over engineering juga, gitu. Nah nanti di sisi Flutter, sebenarnya di sisi Flutter dan admin itu sama ya sebenarnya. Jadi nggak ada bedanya juga sih sebenarnya. Jadi di sisi Flutter dan admin web itu sama. Jadi nggak ada bedanya, gitu. Jadi mereka sharing gitu loh, sharing fitur sebenarnya gitu lah ibaratnya. Jadi datanya sama, gitu. Jadi nanti kira-kira gini, pas dipanggil, ternyata dia nggak ngerespons. Nggak ngerespons, dia ibarat kata nggak ngetap di notifikasi lah ibaratnya gitu ya. Nggak notifikasi gitu, nggak ngetap lah settlement gitu lah. Jadi perlu ada sistem ini sih, perlu ada sistem notifikasi. Nah notifikasi itu dibangun dulu ininya, infrastrukturnya, gitu. Nah kalau dia nggak ngetap juga selama waktu yang ditentukan, maka dia ngantri lagi dari belakang sampai tiga kali nggak dipanggil barulah dia di-claim sebagai telat, gitu loh. Eh, mungkin gini ya. Eh, bukan telat ding, tidak hadir, gitu. Tidak hadir aja statusnya. Biar supaya nggak kebanyakan status gitu loh. tidak hadir. Nah, jadi statusnya tidak hadir, kemudian sudah diproses dan juga ya itu, cuma dua itu aja, tidak hadir dan sudah diproses, gitu kan. Nah jadi kira-kira itu sih spesifikasinya.Nah, jadi ya gitu. Dia udah tereliminasi lah gitu ibaratnya kalau udah tiga kali nggak dipanggil gitu kan. Nah, begitu history. Kemudian juga saya lihat, kalau memang backend ini kan kita paradigmanya nggak over-engineering ya. Kita tidak over-engineering gitu. Jadi kalau data DB-driven menyelesaikan, ya udah dibuatkan migrasinya gitu kan. dibuatkan migrasinya, dibuatkan tabelnya. Maka kemudian ada SSOT di situ, Single Source of Truth, kayak gitu kan. Jadi di backend tuh nggak over-engineering gitu loh. Jadi kira-kira begitu. Cek dulu yang sekarang, apa yang terjadi sekarang? Kamu planningkan gitu bagaimana nantinya gitu ya, apa yang dimigrasikan, seperti itu untuk pasien gitu ya. Nah kemudian untuk yang notifikasi notification module, itu harus beda ya. pasien, pasien module sendiri, notification module sendiri, schedule system management itu sendiri. Jadi nggak boleh semuanya di schedule, jangan gitu loh. Harusnya modulnya beda-beda, tapi kan di-consume oleh banyak modul gitu loh. Jadi dia decouple gitu loh. Jadi mungkin ada sedikit refactor lah gitu ya. Ada refactor kayak gitu. Jadi kira-kira begitu. Nah, tadi saya bilang ya, pelan-pelan dibuatkan semua infrastrukturnya dari sisi backend ya. Mungkin kamu buat semacam testing gitu ya, semua end-to-end untuk paradigma, apa namanya paradigma, apa namanya itu. Sebenarnya tuh dia ini sih, itu udah bukan schedule lagi. Itu udah masuk ke appointment gitu loh. appointment di sisi pasien gitu. Jadi harusnya dibuatkan dulu endpoint-nya. si client itu, apa namanya, dia harusnya tahu. mereka tuh cuma consume data saja gitu loh. Consume data saja. Mereka nggak tahu menahu apa itu segala macam. nggak tahu dia. Mereka cuma consume data, pasang data, dan seterusnya kayak gitu.Oh iya, dan juga statusnya cancel. Jadi si pasien ini bisa meng-cancel, gitu loh. Pasien itu bisa meng-cancel. Jadi itu udah beda lagi ya. Eh, tapi statusnya sama sih, sama kayak tadi. Itu gabungan aja, cancel, gitu. Sekarang tuh udah ada paradigma cancel, tapi perlu diperbaiki ya, karena nggak sejalan juga dengan domain fiturnya, gitu. Dan ini otomatis buat change log ya, buat change log besar ini. Jadi pertama prioritaskan dulu notification itu, dibuatkan dulu infrastrukturnya supaya nanti dia bisa di plug and play. Kemudian pelan-pelan untuk dibuatkan sebuah sistem ininya, apa namanya, sistem appointment itu, gitu. Anda bisa membacanya pada spesifikasi notifikasi infrastruktur yang ada di Markdown yang udah saya berikan. Baca aja, tinggal dibuatkan aja sih, gitu. Jadi nanti karena udah ada, mungkin ya migrasi table-nya, mungkin yang over engineering itu udah lega, gitu loh. Jadi memang udah beda modul, gitu, bukan di schedule management semua. Kalau schedule management butuh data, ya kan tinggal dipanggil aja, diimport aja modulnya. Kan simple kan kayak gitu. Jadi data itu memang benar-benar dari upstream yang factory-kan-nya, gitu. Jadi polanya factory pattern ya. Jadi modul dan jalur controller-nya udah beda, gitu loh. Jadi nggak sama lagi, gitu. Nah, nanti kira-kira begitu.Jadi, lanjut tadi ya, ada tabel history gitu kan, history pasien, dan juga untuk sekarang tuh history pasien aja dulu. Gitu. Untuk sekarang history pasien aja dulu. Nanti lama-lama kita bakalan perbaiki gitu untuk history. Jadi bedanya history pasien dengan history appointment si pegawai itu beda ya, itu beda. Jadi harusnya appointment pasien, bukan appointment pegawai. Itu udah beda gitu. Beda modul dan beda tabel juga gitu.
## 1. Specification Intent

The backend must provide an authoritative, database-driven appointment lifecycle that can be consumed consistently by both the Flutter mobile application and the administrative web application.

The clients must not be responsible for reconstructing appointment business rules, calculating terminal states, determining whether a patient is considered absent, or maintaining independent interpretations of appointment history.

Both the doctor-facing Flutter application and the administrative web application are consumers of the same backend domain.

They may expose different interfaces, but they must observe the same appointment state, the same patient history, and the same lifecycle decisions.

This specification focuses only on the patient appointment lifecycle and patient appointment history.

Employee appointment history, staff activity history, or other historical domains are explicitly outside the current scope and must not be mixed into this implementation.

The first implementation priority is the notification infrastructure because the patient-call lifecycle depends on a reliable notification mechanism. Once that infrastructure exists as an independent module, the patient appointment lifecycle can consume it without embedding notification responsibilities inside the scheduling module.

---

# 2. Problem Statement

The current system contains schedule-management functionality that is shared between doctors and administrators.

However, several responsibilities that belong to the appointment domain appear conceptually close to schedule management and risk being implemented inside the schedule module simply because they are triggered from a schedule screen.

That boundary must be corrected.

A doctor schedule answers questions such as:

- when a doctor is available;
- which practice session exists;
- what time interval belongs to the session;
- whether the schedule is still active;
- which scheduling policy applies.

An appointment answers different questions:

- which patient booked a schedule;
- whether the patient has been called;
- how many times the patient has been called;
- whether the patient responded;
- whether the patient was eventually processed;
- whether the patient failed to attend;
- whether the patient cancelled;
- whether the appointment belongs in patient history.

These concerns must not be collapsed into one schedule-management module.

The backend should therefore treat scheduling, appointments, patients, and notifications as separate domain responsibilities that communicate through explicit contracts.

---

# 3. Architectural Principle

The system must remain database-driven.

The database represents persistent domain truth.

Backend services interpret that truth and enforce business rules.

The clients consume the resulting contract.

Flutter and the administrative web application must not independently implement appointment lifecycle rules that can produce different outcomes.

The intended direction is:

```text
Database
   ↓
Domain / Application Services
   ↓
Backend API
   ↓
Flutter / Admin Web
```

Not:

```text
Backend gives partial data
   ↓
Flutter invents business rules
   ↓
Admin Web implements another interpretation
```

The backend must therefore own lifecycle decisions such as when an appointment becomes `NO_SHOW`, when it becomes `COMPLETED`, and how patient call attempts are counted.

---

# 4. Domain Boundaries

The implementation must preserve clear module boundaries.

At minimum, the architecture should conceptually separate:

```text
Schedule Module
Appointment Module
Patient Module
Notification Module
```

These modules may depend on each other's exported application contracts, but they must not absorb each other's responsibilities.

The Schedule Module owns doctor availability and practice schedules.

The Appointment Module owns patient bookings and their lifecycle.

The Patient Module owns patient-related domain information.

The Notification Module owns notification dispatch infrastructure and delivery integration.

For example, the Appointment Module may request that the Notification Module notify a patient.

That does not mean appointment notification logic belongs inside `schedule.service`, nor does it mean the Notification Module owns appointment state.

Likewise, the Schedule Module may expose schedule information required by the Appointment Module without becoming responsible for patient attendance.

Cross-module access should occur through explicit exported contracts or application services rather than arbitrary direct access to another module's internal repositories.

---

# 5. Existing-System Discovery Requirement

Before introducing migrations, tables, enums, services, or endpoints, inspect the existing backend.

The implementation agent must determine:

- what appointment tables already exist;
- what patient booking representation already exists;
- what status fields already exist;
- what cancellation mechanism already exists;
- what patient-call logic already exists;
- whether notification infrastructure already partially exists;
- whether appointment status history already exists;
- whether database enums already represent equivalent states;
- how doctor schedules reference appointments;
- whether the current schedule module improperly owns appointment logic;
- which services are consumed by Flutter today;
- which services are consumed by the admin application;
- whether both clients already share the same endpoints;
- what migrations already establish schedule-policy configuration.

Do not create another representation simply because its name differs from the terminology used in this specification.

First determine whether the concept already exists.

Prefer migration and correction over duplication.

---

# 6. Schedule Policy Constraint

Practice duration is governed by the existing schedule policy.

The currently described policy uses a 30-minute interval.

This value must not be recreated as a Flutter or administrative-web magic number.

It must remain driven by the authoritative scheduling policy or metrics configuration that already exists in the backend.

For example:

```text
07:00 – 07:30
07:30 – 08:00
08:00 – 08:30
```

These intervals are schedule-domain data.

The appointment system consumes the selected schedule interval but does not independently redefine its duration.

If the current backend already exposes the interval through schedule policy, reuse that source.

Do not introduce another constant representing the same rule.

---

# 7. Patient Appointment Lifecycle

The historical terminal outcomes required by the current product scope are intentionally small.

The backend must support the following terminal appointment outcomes:

```text
COMPLETED
NO_SHOW
CANCELLED
```

Do not introduce a separate `LATE` state for the current requirement.

A patient who booked an appointment but ultimately failed to attend after the defined call procedure should become:

```text
NO_SHOW
```

A patient who attended and completed the consultation workflow should become:

```text
COMPLETED
```

A patient whose appointment was cancelled should become:

```text
CANCELLED
```

Existing non-terminal appointment states may continue to exist if they are already required by the system.

Do not delete or redesign them without first inspecting their current usage.

The three states above specifically define the terminal outcomes required for patient history.

---

# 8. User Story — View Patient History

## US-001 — Doctor Views Patient Appointment History

As a doctor,  
I want to view historical patient appointments that have reached a terminal outcome,  
so that I can understand which patients were processed, did not attend, or cancelled.

### Acceptance Criteria

The backend must provide patient appointment history using authoritative persisted data.

History must include appointments whose lifecycle has reached:

```text
COMPLETED
NO_SHOW
CANCELLED
```

The Flutter application must not determine whether an appointment belongs in history.

The backend must provide the already-classified result.

---

# 9. User Story — Administrator Views the Same History

## US-002 — Administrator Views Patient Appointment History

As an administrator,  
I want to access the same patient appointment history available to the doctor,  
so that operational data remains consistent across administrative and doctor-facing applications.

### Acceptance Criteria

Flutter and Admin Web must consume the same underlying appointment domain.

The backend must not create two independent definitions of patient history.

Authorization may differ.

Presentation may differ.

Available actions may differ.

The underlying appointment state must remain identical.

---

# 10. User Story — Process a Patient

## US-003 — Doctor Completes a Patient Appointment

As a doctor,  
I want an appointment to become completed after the patient actually attends and the consultation workflow is finished,  
so that the appointment appears correctly in patient history.

### Acceptance Criteria

A patient must not become `COMPLETED` merely because:

- the scheduled time was reached;
- a notification was delivered;
- the notification was opened;
- the patient was called once.

Completion represents an actual successful processing of the appointment.

The exact existing action that currently represents consultation completion must be discovered before introducing another command.

If such an action already exists, reuse it.

Once successfully completed, the backend must persist:

```text
status = COMPLETED
```

The state must immediately become visible to both Flutter and Admin Web through the authoritative backend contract.

---

# 11. User Story — Call a Patient

## US-004 — Doctor Calls the Next Patient

As a doctor,  
I want to call a patient who is currently waiting,  
so that the patient can respond and proceed to consultation.

Calling a patient is an appointment-domain operation.

The backend must record the call attempt.

The Notification Module should be responsible for delivering the associated notification.

Conceptually:

```text
Doctor requests patient call
        ↓
Appointment validates current lifecycle
        ↓
Call attempt is persisted
        ↓
Appointment requests notification delivery
        ↓
Notification Module dispatches notification
```

The notification implementation must not become embedded inside the schedule module.

---

# 12. Patient Call Retry Policy

A patient must not immediately become `NO_SHOW` after a single unanswered call.

The required behavior is:

```text
Call #1
↓
No response within configured response window
↓
Patient returns to the back of the waiting queue

Call #2
↓
No response within configured response window
↓
Patient returns to the back of the waiting queue

Call #3
↓
No response within configured response window
↓
Appointment becomes NO_SHOW
```

The maximum number of attempts is currently:

```text
3
```

This is a backend business-policy value.

It must not be duplicated as a magic number across controllers, Flutter widgets, admin pages, or unrelated services.

Represent it through the appropriate centralized policy/configuration mechanism used by the backend.

---

# 13. Response Timeout

A response timeout is required between a call attempt and the decision that the patient failed to respond.

However, the exact timeout duration has not yet been specified in this requirement.

Therefore:

**Do not invent the duration.**

The backend implementation must first inspect whether such a timeout already exists in configuration, appointment policy, queue policy, or an existing specification.

If the value already exists, reuse it.

If no authoritative value exists, expose the missing policy decision explicitly instead of silently choosing an arbitrary duration.

The architecture should nevertheless support a centrally defined value such as:

```text
patientCallResponseTimeout
```

without scattering the value across the codebase.

---

# 14. Requeue Behavior

When a patient fails to respond to call attempt one or two, the appointment must not immediately disappear.

The patient should return to the back of the relevant waiting queue.

This means the backend must distinguish between:

```text
temporarily unanswered
```

and:

```text
final no-show
```

Only when the maximum call-attempt policy is exhausted should the appointment transition to:

```text
NO_SHOW
```

Do not introduce another persistent terminal status merely to represent an intermediate unanswered call.

Intermediate call attempts belong to lifecycle data, not necessarily to the terminal appointment status.

---

# 15. Notification Acknowledgement

A notification interaction may contribute to determining whether the patient responded.

However, notification behavior and appointment completion must remain distinct concepts.

A notification tap must not automatically mean:

```text
COMPLETED
```

unless the existing confirmed business workflow explicitly defines it that way.

The Notification Module should report notification or acknowledgement information.

The Appointment Module decides what that information means for the appointment lifecycle.

This separation prevents infrastructure events from directly owning business state.

---

# 16. Notification Infrastructure Priority

Notification infrastructure is the first implementation priority.

Before completing the retry-based patient call mechanism, establish a reusable Notification Module.

The existing notification infrastructure specification provided in the project documentation must be read before implementation.

Do not replace that specification with assumptions.

The Notification Module should be designed as reusable infrastructure that can later serve multiple backend domains.

Conceptually:

```text
Appointment Module ───┐
Schedule Module ──────┼──> Notification Module
Other Modules ────────┘
```

The Notification Module must not become tightly coupled to patient appointments.

Likewise, the Appointment Module must not contain provider-specific notification implementation.

---

# 17. Patient History Persistence

Patient history must be database-driven.

However, avoid creating unnecessary duplicated records solely to make a history page easier to query.

The primary appointment record should remain the authoritative representation of the current appointment outcome.

A history endpoint can normally query appointments whose terminal state is:

```text
COMPLETED
NO_SHOW
CANCELLED
```

For example, conceptually:

```text
appointments
WHERE status IN (
  COMPLETED,
  NO_SHOW,
  CANCELLED
)
```

This alone may be sufficient for the history screen.

A separate history table becomes justified when the system must preserve lifecycle transitions, auditability, call attempts, or immutable historical events.

Therefore, the recommended distinction is:

```text
appointments
```

for the current authoritative appointment state,

and an append-only structure such as:

```text
appointment_status_history
```

or an equivalent existing domain table,

for lifecycle/audit history.

Do not create a second full copy of every appointment merely called `patient_history` if it only duplicates `appointments`.

---

# 18. Appointment Lifecycle History

If lifecycle auditing does not already exist, the backend should support an append-only record of important appointment transitions.

For example:

```text
appointment_id
previous_status
new_status
changed_at
changed_by
reason / source
```

Exact fields must follow the project's existing database conventions.

Do not introduce these exact names blindly.

The purpose is to answer questions such as:

- when was the appointment cancelled?
- when did it become completed?
- when did it become no-show?
- what action triggered the transition?
- which actor initiated the transition?

This history must not become another mutable source of current appointment truth.

The appointment record remains authoritative for current state.

The history structure records how that state was reached.

---

# 19. Call Attempt Persistence

Patient call attempts should also be persistable rather than existing only inside Flutter state.

The backend needs enough information to determine:

- how many times the patient has been called;
- when each call occurred;
- whether the call received an acknowledgement;
- whether the response window expired;
- whether the patient was requeued;
- whether the final attempt resulted in `NO_SHOW`.

The implementation must first check whether the current schema already contains a suitable representation.

Do not create another table if an existing appointment-event or queue-attempt structure already satisfies the requirement.

---

# 20. Cancellation

Patient cancellation already exists conceptually in the current system but may not yet align cleanly with the appointment domain.

The current implementation must therefore be inspected before modification.

Cancellation belongs to the appointment lifecycle.

The terminal result must be represented consistently as:

```text
CANCELLED
```

A cancelled appointment should appear in patient appointment history.

Do not implement cancellation independently in:

- Flutter;
- Admin Web;
- Schedule Module;
- Patient Module.

The backend Appointment Module must own the state transition.

Clients only request the action and consume the result.

---

# 21. Backend-Owned Filtering

Clients should not fetch all appointments and independently decide which ones constitute history.

The backend should expose the required history contract.

Filtering, pagination, authorization, ordering, and status interpretation belong to the backend.

Conceptually, the endpoint must provide:

```text
Patient Appointment History
```

rather than requiring clients to perform:

```text
fetch everything
→ calculate expired appointments
→ inspect timestamps
→ infer attendance
→ infer cancellation
→ build history
```

That logic would produce inconsistent clients.

---

# 22. History API Requirement

The backend must provide an appointment-history capability.

The exact route naming must follow the existing API conventions after repository discovery.

Do not invent a conflicting URL structure simply because an example exists in this specification.

The endpoint must support at minimum:

- retrieving terminal patient appointments;
- appropriate authorization;
- deterministic ordering;
- pagination where the existing API standard requires it;
- consistent appointment status;
- patient information required by the consuming clients;
- relevant schedule/date information;
- terminal-state timestamps where available.

Both Flutter and Admin Web should be able to consume this contract.

---

# 23. Single Source of Truth

The following must not exist as independent competing authorities:

```text
Flutter appointment status
Admin appointment status
Schedule appointment status
Patient appointment status
History appointment status
```

There should be one appointment lifecycle.

Different modules may expose different projections of it.

For example:

```text
Appointment SSOT
     │
     ├── Doctor queue projection
     ├── Admin appointment projection
     ├── Patient history projection
     └── Schedule occupancy projection
```

A projection is not another source of truth.

---

# 24. Data Ownership

The intended ownership should remain conceptually similar to:

```text
Schedule Module
owns:
- doctor practice sessions
- availability
- schedule policy
- time intervals

Appointment Module
owns:
- booking
- lifecycle
- queue participation
- attendance outcome
- cancellation
- completion
- no-show determination

Patient Module
owns:
- patient domain data

Notification Module
owns:
- notification delivery infrastructure
- delivery attempts
- provider integration
```

Do not put every operation triggered from a schedule screen into the Schedule Module.

UI location does not define backend domain ownership.

---

# 25. Shared Feature Between Doctor and Admin

Doctor and admin functionality may expose equivalent appointment-management capabilities.

This does not justify duplicated business logic.

Both actors should invoke the same backend domain operations, subject to authorization.

For example:

```text
Doctor → Appointment Application Service
Admin  → Appointment Application Service
```

rather than:

```text
Doctor → Doctor Appointment Logic
Admin  → Admin Appointment Logic
```

RBAC may determine whether an operation is allowed.

RBAC must not create two appointment state machines.

---

# 26. Factory / Composition Principle

Where multiple modules require the same upstream appointment representation, construct that representation through a centralized domain/application composition boundary.

Do not independently rebuild the same response in each controller.

If the existing architecture already uses factories, presenters, serializers, assemblers, mappers, or application DTO builders, use that established pattern.

The important requirement is not the word "Factory."

The requirement is:

```text
one authoritative composition path
→ reusable by multiple consumers
→ no duplicated domain interpretation
```

Do not introduce a Factory Pattern merely for architectural decoration if the existing architecture already provides an equivalent abstraction.

---

# 27. Refactoring Requirement

Some refactoring may be necessary if appointment or notification responsibilities currently live inside Schedule Management.

The refactor should be incremental.

Do not rewrite the complete backend.

First identify responsibilities that clearly belong elsewhere.

Then move them behind explicit module contracts.

Examples of suspicious ownership include:

- patient cancellation implemented inside schedule service;
- patient attendance stored as schedule state;
- notification provider logic embedded inside schedule service;
- patient call attempts represented as schedule mutations;
- appointment history generated through schedule-specific code;
- notification tables owned by the schedule module.

Move responsibilities only after confirming the current implementation.

---

# 28. Migration Strategy

Before creating migrations, inspect the current schema.

Produce a migration plan containing:

```text
Existing structure
→ Gap
→ Required migration
→ Why it is necessary
→ Source-of-truth impact
→ Backward compatibility impact
```

Do not create duplicate columns simply because the specification uses different terminology.

Do not introduce a new status column if an existing appointment status already represents the lifecycle correctly.

Do not create a patient-history table if a proper appointment event/history table already exists.

Do not remove existing data without an explicit migration strategy.

---

# 29. Transactional Consistency

Lifecycle transitions that modify appointment state and related call-attempt state must remain transactionally safe.

For example, the backend must avoid conditions where:

```text
call attempt count = 3
```

but:

```text
appointment status != NO_SHOW
```

because one write succeeded and another failed.

Likewise, cancellation or completion must not leave queue state inconsistent.

Use the project's existing transaction mechanism.

Do not introduce distributed transaction complexity unless the existing infrastructure genuinely requires it.

---

# 30. Concurrency

Because both doctors and administrators may operate on the same appointment domain, concurrency must be considered.

The backend must prevent incompatible simultaneous lifecycle transitions.

For example:

```text
Doctor completes appointment
```

while at exactly the same time:

```text
Admin cancels appointment
```

must not silently produce an undefined state.

Use the database and existing concurrency strategy as the final authority.

The implementation should determine whether the project already uses:

- transactional locking;
- optimistic concurrency;
- status-conditional updates;
- version fields;
- equivalent safeguards.

Reuse the simplest existing strategy that correctly protects the lifecycle.

---

# 31. Idempotency

Repeated user actions or network retries must not accidentally create multiple call attempts or repeated terminal transitions where the existing API architecture can reasonably prevent them.

For example, rapidly submitting the same patient-call action twice should not accidentally count as two legitimate doctor calls unless two distinct calls were intentionally performed.

The implementation should inspect whether the project already has request-id or idempotency conventions.

Do not introduce a complex platform-wide idempotency system solely for this feature if a simpler transactional guard is sufficient.

---

# 32. History Ordering

Patient history should be deterministic.

The backend should define the authoritative ordering, rather than leaving Flutter and Admin Web to sort differently.

The implementation should normally use the appropriate terminal or appointment timestamp according to existing domain semantics.

Do not invent which timestamp is authoritative without inspecting the schema.

---

# 33. No Client-Side Business Reconstruction

Flutter and Admin Web must not be required to calculate:

```text
if currentTime > appointmentEnd
and attemptCount >= 3
and notificationNotOpened
then status = NO_SHOW
```

This is backend business logic.

The backend should instead return an authoritative state such as:

```text
NO_SHOW
```

Clients render it.

The same principle applies to:

```text
COMPLETED
CANCELLED
```

---

# 34. Notification Integration

Appointment should depend on a notification abstraction, not a concrete notification provider.

Conceptually:

```text
Appointment
   ↓
Notification contract
   ↓
Notification infrastructure
   ↓
Provider
```

This allows notification infrastructure to remain reusable and replaceable.

The Appointment Module should not need to know whether delivery eventually uses:

- push notification;
- websocket;
- another delivery mechanism;
- multiple mechanisms.

Those implementation decisions belong to the Notification Module and the existing notification specification.

---

# 35. End-to-End Scenario — Successful Consultation

Given a patient has a valid appointment,

when the doctor calls the patient,

and the patient successfully proceeds to consultation,

and the appointment is settled through the authoritative completion action,

then the appointment must become:

```text
COMPLETED
```

and it must appear in patient history.

Both Flutter and Admin Web must observe the same result.

---

# 36. End-to-End Scenario — First Missed Call

Given a patient has a valid appointment,

when the doctor calls the patient for the first time,

and the configured response window expires without the required response,

then the patient must not yet become `NO_SHOW`.

The attempt must be recorded.

The patient should be requeued according to the confirmed queue policy.

---

# 37. End-to-End Scenario — Second Missed Call

Given the patient has already missed one call,

when the second valid call also expires without response,

then the appointment must still not become terminal.

The second attempt must be recorded.

The patient should again be requeued.

---

# 38. End-to-End Scenario — Third Missed Call

Given the patient has already missed two valid calls,

when the third call expires without the required response,

then the backend must transition the appointment to:

```text
NO_SHOW
```

The appointment must leave the active queue.

The result must appear in patient history.

The transition must be observable consistently by Flutter and Admin Web.

---

# 39. End-to-End Scenario — Cancellation

Given a patient has an appointment that can still be cancelled under the existing cancellation rules,

when cancellation succeeds,

then the backend must persist:

```text
CANCELLED
```

The appointment must no longer participate in the active queue.

It must appear in patient history.

The same result must be returned to all consuming clients.

---

# 40. E2E Testing Requirement

Backend implementation must include tests covering the complete lifecycle rather than testing only isolated repository functions.

At minimum verify:

```text
booking → active queue
active queue → first call
first call → unanswered → requeue
second call → unanswered → requeue
third call → unanswered → NO_SHOW
```

Also verify:

```text
booking → call → consultation → COMPLETED
```

and:

```text
booking → cancellation → CANCELLED
```

Tests must also verify that patient history returns the correct terminal outcomes.

---

# 41. Integration Testing

Verify integration between:

```text
Appointment ↔ Schedule
Appointment ↔ Patient
Appointment ↔ Notification
Appointment ↔ Database
```

The tests should prove module contracts rather than rely on hidden cross-module behavior.

---

# 42. Notification Failure

A notification infrastructure failure must not silently corrupt appointment lifecycle state.

The backend must distinguish between:

```text
appointment call requested
```

and:

```text
notification successfully dispatched
```

The exact retry/error strategy must follow the existing notification infrastructure specification.

Do not invent delivery guarantees that the notification infrastructure cannot provide.

---

# 43. History Scope

For this iteration, implement:

```text
Patient Appointment History
```

only.

Do not generalize prematurely into:

```text
Universal History Engine
Activity History Platform
Employee History
Schedule History
Audit Everything Service
```

Those may be separate future concerns.

The current scope remains intentionally narrow.

---

# 44. Patient History vs Employee History

Patient appointment history and employee/staff appointment history are separate concepts.

They must not share a table merely because both contain the word "history."

If staff history is introduced later, its domain model should be evaluated independently.

Do not design that future system now.

---

# 45. Naming

Avoid ambiguous backend names such as:

```text
history
data
record
process
statusData
scheduleHistory
userHistory
```

when the actual concept is more precise.

Prefer names that reveal the domain, such as:

```text
patientAppointmentHistory
appointmentStatusHistory
appointmentCallAttempt
appointmentLifecycle
```

Exact naming must still follow project conventions.

Do not rename established concepts unnecessarily.

Rename only where ambiguity materially damages maintainability.

---

# 46. Change Log

This is a significant domain correction and must produce an explicit change log.

The change log should describe:

- notification infrastructure introduced or modified;
- appointment module changes;
- schedule responsibilities moved or removed;
- migrations introduced;
- appointment lifecycle states affected;
- cancellation changes;
- no-show policy;
- patient call-attempt policy;
- new history capability;
- endpoint changes;
- backward compatibility impact;
- Flutter contract impact;
- Admin Web contract impact;
- deprecated behavior, if any.

Do not hide architectural migrations inside generic entries such as:

```text
"refactor backend"
```

The change log must explain what domain ownership changed.

---

# 47. Implementation Order

The recommended implementation sequence is:

```text
1. Discover current backend implementation
2. Read existing notification infrastructure specification
3. Map current Schedule / Appointment / Patient responsibilities
4. Identify existing database structures
5. Identify existing appointment statuses and cancellation behavior
6. Design the minimal required migration
7. Establish or complete Notification Module infrastructure
8. Establish clear Appointment Module ownership
9. Persist patient call attempts
10. Implement retry / requeue lifecycle
11. Implement NO_SHOW transition
12. Align COMPLETED transition
13. Align CANCELLED transition
14. Provide patient history query/API
15. Remove obsolete schedule-owned appointment logic
16. Add integration and E2E tests
17. Update changelog and backend documentation
```

Do not begin by creating every table described conceptually in this document.

Discovery comes first.

---

# 48. Questions the Backend Agent Must Answer

Before implementation, answer the following using evidence from the codebase.

What table currently represents a patient booking?

What is the current source of truth for appointment status?

Where is cancellation currently implemented?

What statuses currently exist?

Does a completed/processed state already exist?

Does a no-show equivalent already exist?

Does the system already track patient calls?

Is there already a queue representation?

What happens today when a doctor presses "call patient" in Flutter?

Which endpoint is invoked?

What does that endpoint mutate?

Does it currently touch schedule state?

Does it already create a notification?

Does the notification module already exist?

Does the notification specification already define acknowledgement?

Does the backend currently know whether the patient responded?

What action currently represents successful consultation completion?

Does clicking or opening a notification have any existing business meaning?

What currently removes a patient from the waiting queue?

Where is the 30-minute schedule policy stored?

Is the schedule interval database-driven?

How is the policy exposed to clients?

Does a patient-history endpoint already exist?

Can the current appointments table already produce the required history through filtering?

Is an audit/history table already present?

Does the database already contain event or status-transition structures?

Are there duplicate appointment concepts inside the Schedule Module?

Are Doctor and Admin currently using the same appointment service?

Are their implementations already diverging?

What schema migration is actually required?

Which existing code becomes obsolete after the domain correction?

---

# 49. Explicit Non-Goals

Do not redesign the Flutter UI.

Do not redesign the Admin Web UI.

Do not create client-side appointment business logic.

Do not create employee history.

Do not create a universal event-sourcing architecture.

Do not migrate the entire backend to CQRS.

Do not introduce Kafka, RabbitMQ, or another broker merely because notifications are asynchronous unless the existing notification specification explicitly requires it.

Do not create microservices.

Do not duplicate appointment state across modules.

Do not rewrite schedule management unnecessarily.

Do not invent new status values without confirmed requirements.

Do not create a separate history snapshot table if filtering the authoritative appointment table plus an audit trail already solves the requirement.

Do not hardcode policy values in consuming clients.

---

# 50. Final Backend Principle

The desired backend should be simple to reason about.

A doctor schedule defines when care can occur.

An appointment represents a patient's booking against that schedule.

The appointment lifecycle determines what eventually happened to that booking.

Notification infrastructure helps the system communicate with the patient.

Patient history exposes appointments that have reached a terminal outcome.

The backend owns those decisions.

Flutter and Admin Web consume them.

The target architecture should therefore resemble:

```text
                    ┌──────────────────┐
                    │ Schedule Module  │
                    └────────┬─────────┘
                             │
                             │ schedule reference
                             ▼
┌───────────────┐    ┌───────────────────┐    ┌────────────────────┐
│ Patient Module│───▶│ Appointment Module│───▶│ Notification Module│
└───────────────┘    └─────────┬─────────┘    └────────────────────┘
                               │
                               ▼
                       Authoritative Database
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
        Flutter Mobile                  Admin Web
```

The clients must not need to understand the internal lifecycle machinery.

They should request an operation and consume authoritative results.

The backend should know:

- what the appointment is;
- whether it is active;
- how many valid calls have occurred;
- whether the patient responded;
- whether the appointment was completed;
- whether the patient became a no-show;
- whether the appointment was cancelled;
- whether the appointment belongs in patient history.

That is the domain responsibility of the backend.

Keep the architecture decoupled, database-driven, explicit, and minimal.

Do not move complexity from one module into another.

Remove unnecessary complexity where existing authoritative data already solves the problem.

Most importantly:

**inspect the current implementation before designing the replacement.**

Reuse what is correct.

Refactor what has incorrect ownership.

Migrate only what is missing.

Then expose one consistent appointment truth to every client.