Appointment Backend Design Philosophy and Hardening Rules
1. Purpose
This document defines the engineering philosophy, domain paradigm, edge-case model, testing expectations, and coding rules for the Appointment module.
The goal is not to make the system appear correct through superficial tests. The goal is to make the system behave correctly under real user operations, persisted state mutations, real-time events, and realistic edge cases.
The backend is the single source of truth for appointment state, queue semantics, scheduling policy, and operational outcomes.
The frontend must consume backend decisions. It must not recreate them.
2. Core Design Philosophy
2.1 Think in state transitions, not UI appearances
The primary question is:
What happens to the system when a user performs an operation?

For every meaningful operation, reason through:
User Action -> Input -> Validation -> Domain Mutation -> Persistence -> Event -> Output -> Consumer
A test that only checks whether a component renders a color, contains text, or calls a function is secondary.
The important question is whether the underlying state changed correctly and whether every consumer receives the correct resulting state.
2.2 Data in, mutation, data out
The highest-priority testing target is:
1. Realistic input enters the system.
2. The correct domain operation is executed.
3. The correct database mutation occurs.
4. The resulting persisted state is correct.
5. The correct response is returned.
6. The correct real-time event is emitted when applicable.
7. The frontend can consume the resulting contract.
Do not declare a feature successful merely because its test suite passes.
A green test suite is evidence only for the behavior actually exercised by the tests.
2.3 Automation must reduce the need for manual discovery
Automated tests exist to protect humans from repeatedly discovering the same bugs manually.
Therefore:
- Manual testing validates realistic end-to-end behavior.
- Automated tests protect known behavior and edge cases.
- Integration/contract tests validate boundaries.
- Unit tests validate isolated domain rules where isolation is useful.
Do not reverse this priority by creating large quantities of meaningless unit tests while the real workflow remains untested.
3. Appointment Queue Paradigm
The system must distinguish between two fundamentally different concepts:
A. Queue prediction / assignment
This answers:
Based on the configured consultation interval and existing appointments, what queue position can be assigned?

The configured interval is a scheduling/prediction policy.
Example:
- Appointment A starts at 08:00.
- Configured consultation interval = 30 minutes.
- A is assigned queue position 1.
- The predicted next position begins at 08:30.
- Appointment B can therefore be assigned queue position 2.
The 30-minute interval is not a promise that the real consultation will finish in exactly 30 minutes.
B. Actual operational service
This answers:
What is actually happening inside the clinic right now?

A consultation may last:
- 10 minutes
- 30 minutes
- 45 minutes
- longer than the configured interval
The system must never confuse the predicted schedule with actual clinical operation.
The configured interval provides a deterministic basis for queue assignment. It does not control reality.
4. Configuration Must Be Data-Driven
The consultation interval must not be hard-coded in application logic.
The authoritative value must come from the existing scheduling/policy configuration.
If the policy changes from 30 minutes to another value, queue assignment must follow the configured policy without requiring a source-code change.
Do not introduce duplicate configuration values in:
- frontend constants,
- backend magic numbers,
- utility functions,
- UI components,
- tests that silently encode a different policy.
The database/configuration layer is authoritative.
5. Appointment Operational State
Do not create ambiguous or overlapping statuses.
A status must represent one clear operational meaning.
At minimum, reason about the lifecycle conceptually as:
Scheduled/Waiting -> Called -> In Service -> Completed
A late/no-show condition is a separate operational outcome and must not be inferred from notification count.
The exact persisted enum names must follow the existing backend convention. Do not invent competing terminology merely because another naming style appears cleaner.
Status rules
- Backend owns status transitions.
- Frontend consumes status.
- Frontend must not independently infer domain status from timestamps.
- Notification delivery does not equal attendance.
- Calling a patient does not equal the patient entering service.
- A patient entering service must produce an explicit state mutation.
- Completion must produce an explicit state mutation.
- Queue position must not be recalculated in the presentation layer.
6. Edge Case Paradigm
The system must explicitly distinguish these cases.
Edge Case 1: Early Arrival
A patient may arrive before the predicted appointment time.
Example:
- Scheduled start: 08:00.
- Patient arrives: 07:00.
- Clinic is empty.
- No operational reason exists to keep the patient waiting until 08:00.
The system must allow the authorized clinic operator to move the patient into active service according to clinic policy.
The original predicted queue position remains a scheduling reference.
The actual service start is an operational event.
Do not rewrite the scheduling algorithm merely because the patient arrived early.
Edge Case 2: Consultation Overrun
A consultation can exceed the configured interval.
Example:
- Patient A predicted slot: 08:00–08:30.
- Actual consultation continues until 08:45.
- Patient B remains waiting.
Patient B does not automatically become In Service at 08:30.
The predicted time is not an automatic service transition.
Patient B remains waiting until the clinic actually calls/admits them.
This is the key distinction:
Scheduling predicts availability. Operational state records reality.

Edge Case 3: Short Consultation
A consultation may finish earlier than the configured interval.
Example:
- Predicted duration: 30 minutes.
- Actual consultation: 10 minutes.
The system must allow the operator to complete the appointment when the real consultation ends.
Do not artificially keep the appointment active until the predicted end time.
Edge Case 4: Late / No-Show
Do not use an arbitrary rule such as:
Three calls without acknowledgement = late.

Repeated calls are an operational notification mechanism, not a reliable attendance detector.
The deterministic no-show policy should be based on the agreed business rule.
Current intended paradigm:
If the patient has not arrived within the defined 24-hour window after the appointment reference, the appointment may be declared late/no-show according to the backend policy.

This must be implemented as an explicit domain rule, not as frontend timer logic.
The system must not infer lateness merely because a push notification was not acknowledged.
7. Patient Calling Is an Operational Action
Calling a patient means:
The clinic is requesting the patient to attend service.

It does not mean:
- the patient has arrived,
- the patient has acknowledged the notification,
- the patient is already in service,
- the appointment is completed.
Calling can be repeated as needed by clinic staff.
There is no artificial three-call limit.
The call operation should produce the appropriate backend mutation and real-time event.
8. Push Notification Semantics
The browser/mobile web application may use Web Push.
A notification may:
- appear in the browser,
- appear in the device notification area,
- provide vibration where browser/OS capabilities and permissions support it.
Do not treat notification delivery or acknowledgement as authoritative attendance state.
The backend remains authoritative.
If notification delivery fails, the appointment state must remain logically valid.
If a user does not acknowledge a notification, that alone must not automatically mutate the appointment into late/no-show.
9. Real-Time Architecture
The Appointment module should integrate with the existing real-time infrastructure.
When a meaningful appointment state mutation occurs:
Command -> Transaction -> Persisted State -> Domain Event -> Real-Time Transport -> Client
Do not emit events that claim a state transition before the authoritative mutation succeeds.
Real-time events should represent meaningful domain changes, such as:
- patient called,
- patient status changed,
- appointment updated,
- appointment completed,
- relevant queue/operational state changed.
The frontend consumes events and refreshes/reconciles its state.
Do not move domain decisions into websocket handlers.
10. Backend Single Source of Truth
The backend owns:
- appointment state,
- queue assignment,
- scheduling policy,
- consultation interval,
- operational transitions,
- late/no-show determination,
- authorization,
- validation,
- persistence,
- event semantics.
The frontend must not duplicate these rules.
Never implement backend policy again in:
- React components,
- hooks,
- TypeScript utility functions,
- route-level conditions,
- client-side date calculations,
- hard-coded status mappings that replace the API contract.
A frontend may format or present backend data. It must not redefine it.
11. Database-First Simplification
Avoid unnecessary backend manipulation when the database can express the invariant cleanly.
Before adding application-level complexity, ask:
1. Can the database schema express the invariant?
2. Can a constraint prevent invalid data?
3. Can an index enforce efficient lookup?
4. Can a query return the required canonical data directly?
5. Can a transaction guarantee the mutation atomically?
Prefer a clean schema and predictable query over layers of defensive transformations.
Do not overengineer.
Do not add abstractions merely because they sound enterprise-grade.
12. Architecture Rules
Use clean architecture/layered/hexagonal principles where they improve separation of responsibility.
The exact folder naming may follow the existing codebase, but responsibilities must remain separated.
Recommended conceptual boundaries:
- Domain: business rules and domain concepts.
- Application: use cases/orchestration.
- Infrastructure: database, messaging, external services.
- Presentation/API: transport and serialization.
Dependency direction must point toward stable domain/application concepts rather than allowing infrastructure concerns to leak everywhere.
500 LOC rule
A source file should remain at or below approximately 500 lines.
If a file approaches this boundary, consider whether responsibilities should be split.
Do not split files mechanically just to satisfy a number.
Split by responsibility.
No spaghetti control flow
Avoid:
- deeply nested if blocks,
- callback pyramids,
- repeated defensive branching,
- duplicated transformations,
- hidden side effects,
- circular dependencies,
- God services,
- God controllers,
- massive handlers.
Prefer:
- small use cases,
- explicit domain operations,
- early validation,
- clear dependency boundaries,
- deterministic state transitions,
- focused services.
13. No Anxiety Code
Do not write code based on fear of hypothetical problems without evidence.
Avoid patterns such as:
- defensive fallback after fallback after fallback,
- silently replacing invalid backend data with invented values,
- swallowing errors,
- broad catch blocks that hide failures,
- speculative compatibility layers,
- duplicated status interpretations,
- magic defaults that conceal missing configuration.
When a required invariant is missing, fail explicitly and observably.
Do not make the system appear healthy by hiding the problem.
14. Testing Hardening
Mandatory priority order
1. Real end-to-end workflow.
2. API/integration behavior.
3. Persistence and mutation correctness.
4. Domain edge cases.
5. Real-time event behavior.
6. Contract validation.
7. Unit tests.
8. Presentation-level tests.
This does not mean UI tests are useless.
It means they must not be used as evidence that the business workflow works.
A meaningful appointment test should answer:
- What input was supplied?
- Which user performed it?
- Which endpoint/use case was invoked?
- What authorization applied?
- What database state existed before?
- What mutation occurred?
- What database state exists afterward?
- What response was returned?
- What event was emitted?
- What does the consumer receive?
- What happens under the relevant edge case?
Forbidden testing theater
Do not create tests solely to:
- increase coverage percentage,
- satisfy a test-count target,
- prove a component renders a color,
- assert an implementation detail with no business meaning,
- mock away the entire system being tested,
- reproduce the implementation rather than verify behavior.
If a test can pass while the real workflow is broken, it is insufficient as evidence for that workflow.
Never claim success without evidence
The agent must not say:
"Appointment module is fully working."

unless the relevant behavior was actually exercised.
If only unit tests were executed, say exactly that.
If integration tests passed but manual/browser behavior was not verified, say so.
If credentials or a running environment are required, request access rather than fabricating verification.
15. Real Testing Requirement
When manual testing is required:
1. Use the actual application.
2. Use realistic credentials.
3. Perform the real user workflow.
4. Observe the actual UI.
5. Verify the API/network mutation where useful.
6. Verify persisted state.
7. Verify real-time behavior.
8. Record failures.
9. Fix the root cause.
10. Re-run the affected workflow.
Do not rely on a previous test plan after significant code changes.
Tests must be re-evaluated after mutations to the implementation.
16. Change Discipline
Before changing code:
- inspect the existing implementation enough to understand the affected boundary;
- identify the canonical source of truth;
- identify existing handlers and events;
- identify existing status definitions;
- avoid rewriting working infrastructure unnecessarily.
After changing code:
- run the smallest meaningful verification first;
- then run broader tests when justified;
- verify the actual mutation;
- verify affected consumers;
- inspect regressions in adjacent appointment flows.
Do not perform large speculative refactors when a focused correction is sufficient.
17. LLM Anti-Hallucination Rules
The coding agent must distinguish:
- observed fact,
- code evidence,
- test evidence,
- assumption,
- proposal.
Never present an assumption as an implementation fact.
Never claim an endpoint works merely because its handler exists.
Never claim real-time works merely because an event class exists.
Never claim a mutation works merely because a service method exists.
Never claim a UI works merely because its component renders.
If the behavior has not been executed, it is unverified.
When uncertain, inspect the relevant implementation and execute the smallest meaningful verification.
Do not waste context repeatedly reading unrelated files once the required boundary is understood.
18. Definition of Done
Appointment work is not done merely because code compiles.
A meaningful definition of done is:
- Domain rules are explicit.
- Backend is authoritative.
- Queue assignment uses configured policy.
- Operational duration is not confused with predicted duration.
- Early arrival is handled.
- Consultation overrun is handled.
- Short consultation is handled.
- Late/no-show behavior is deterministic.
- Calling is independent from attendance acknowledgement.
- Real-time events represent persisted state changes.
- API contracts are coherent.
- Persistence is verified.
- Relevant edge cases are tested.
- Existing UI is respected.
- No duplicated domain logic exists in the frontend.
- No superficial test suite is being used as proof of real functionality.
The system must be explainable from input to persisted outcome.Appointment Frontend Consumption and Design Rules
1. Purpose
This document defines how the Appointment frontend must consume, present, and interact with backend-owned appointment behavior.
The frontend is a consumer and presentation layer.
It must not become a second business-logic engine.
The backend determines what happened. The frontend determines how that result is presented and how the user initiates an action.
2. Core Paradigm
Think:
User Intent -> UI Action -> API Command -> Backend Decision -> Persisted State -> Real-Time Event -> Frontend State -> Presentation
Not:
User Intent -> Frontend guesses business rule -> Frontend mutates local domain state -> Backend receives a reconstructed interpretation
The backend is authoritative.
The frontend must consume canonical backend data.
3. Appointment Patient Page
The existing appointment patient page/template should be preserved.
Do not redesign the UI unless the requirement explicitly asks for a design change.
The page should consume real appointment data rather than placeholder or invented data.
The conceptual patient list should expose relevant information such as:
- patient identity,
- appointment/service information,
- assigned doctor or practitioner where applicable,
- queue information where provided,
- appointment/status information,
- other essential backend-provided fields.
The exact fields must follow the existing API contract and domain model.
Do not invent duplicate frontend-only representations of appointment data.
4. Patient Actions
The primary actions are intentionally simple:
View Patient Detail
Open the authoritative patient/appointment detail.
The frontend should request or consume the canonical backend data.
Do not reconstruct medical or appointment information from unrelated client state.
Call Patient
Calling a patient is a backend operation.
The frontend should:
1. trigger the command;
2. show an appropriate loading state;
3. handle success/error;
4. consume the resulting state;
5. react to the real-time update when applicable.
The frontend must not independently decide:
- whether the patient is late,
- how many calls are allowed,
- whether the patient has acknowledged the call,
- whether the patient has entered service.
Those are backend/domain concerns.
5. Status Consumption
Status values must have one authoritative meaning.
Do not create ambiguous frontend states such as:
- waiting,
- pending,
- queued,
- called,
- inProgress,
- serving,
- active
if they are actually describing the same backend concept.
Use the canonical API contract.
If backend status is English, the internal frontend model may remain English.
Human-facing labels may be Indonesian.
Example conceptual separation:
Backend status -> frontend domain model -> Indonesian UI label
The UI does not need to expose backend terminology directly.
6. Hide Backend Complexity
Users are not technical operators.
Do not expose:
- architectural terminology,
- database terminology,
- internal event names,
- implementation details,
- corporate buzzwords,
- backend-specific abstractions.
The user needs an understandable outcome.
For example, an internal backend state may be technically precise while the UI simply presents:
- Menunggu
- Dipanggil
- Sedang Dilayani
- Selesai
- Tidak Hadir
The exact wording must follow the established application language and existing design system.
The frontend should abstract complexity, not advertise it.
7. No Domain Logic in Presentation
Presentation components must remain clean.
A component should primarily:
- render data,
- collect user intent,
- invoke actions,
- display loading/error/success states.
Do not place business rules directly inside JSX/rendering logic.
Avoid:
- queue calculations in components,
- appointment duration calculations,
- late/no-show calculations,
- status inference from timestamps,
- hard-coded schedule policies,
- duplicate backend validation,
- domain mutation logic inside event handlers.
If logic is genuinely frontend-specific, move it into the appropriate hook/model/rules/state layer.
8. Hooks and State
Use hooks to manage frontend-specific interaction and state.
A hook should not become a disguised backend domain engine.
Good responsibilities include:
- query lifecycle,
- mutation lifecycle,
- local UI state,
- event subscription,
- loading/error state,
- frontend-specific presentation coordination.
Bad responsibilities include:
- reimplementing queue assignment,
- calculating backend appointment status,
- deciding whether a patient is late,
- reconstructing backend scheduling policy,
- silently changing canonical server values.
9. Real-Time Consumption
The frontend should subscribe to the existing real-time infrastructure.
When a patient is called or appointment state changes:
Backend mutation -> event -> frontend reconciliation
The frontend should not pretend the mutation succeeded before the backend confirms it unless the application deliberately uses an established optimistic-update strategy.
For operational appointment actions, correctness is more important than artificial UI immediacy.
When a real-time event arrives:
- reconcile with canonical server state;
- update the relevant appointment;
- avoid duplicating the domain transition locally;
- avoid creating conflicting local state.
10. Loading and Error States
Every backend action must provide visible feedback.
Do not leave the user wondering whether an operation is running.
For actions such as:
- call patient,
- complete appointment,
- update appointment,
- fetch detail,
show an appropriate loading state.
Errors must remain observable.
Do not silently swallow errors.
Do not replace failed server data with fake fallback data merely to keep the UI visually populated.
11. Queue Display
Queue number is consumed data.
The frontend must not calculate it.
If the backend says:
queueNumber = 2
the frontend presents queue number 2.
It must not independently calculate:
startTime + interval
and derive a different queue position.
The same applies to:
- predicted start time,
- appointment status,
- late/no-show state,
- consultation state.
12. Predicted Schedule vs Actual Operation
The frontend must preserve the distinction between:
Predicted schedule
A reference generated from scheduling policy.
Actual operation
What the clinic is currently doing.
Therefore:
- A 30-minute configured interval does not mean the UI should automatically move the next patient into service at 30 minutes.
- A patient arriving early does not require the UI to rewrite the schedule.
- A consultation continuing beyond the predicted interval does not mean the next patient is automatically active.
- A short consultation does not require the UI to wait for the predicted end time.
The UI displays the backend's authoritative operational state.
13. Calling Does Not Equal Attendance
After the clinic calls a patient, the UI must not automatically assume:
Called -> In Service
unless the backend explicitly defines that transition.
Calling is an action.
Attendance/service entry is a state transition.
Notification acknowledgement is not authoritative attendance.
The UI must follow the backend contract.
14. Late / No-Show Presentation
Do not implement:
Three missed notifications = late.

Do not use frontend timers to determine late/no-show state.
If the backend exposes a late/no-show state, display it.
If the backend has not determined the state, the frontend must not invent it.
The agreed deterministic policy belongs to the backend.
15. Web Push and Vibration
The patient may use the web application on a phone.
When a patient is called, the system may deliver a Web Push notification.
The frontend may request/handle supported notification and vibration capabilities.
However:
- browser support varies;
- OS permissions vary;
- notification delivery may fail;
- vibration may not be available in every browser/context.
Therefore these capabilities are supplementary UX.
They must never become the source of truth for appointment attendance.
The backend state remains authoritative.
16. Existing Design System Is Sacred
The existing frontend has already been designed.
Do not casually replace:
- typography,
- font hierarchy,
- spacing,
- colors,
- semantic status tokens,
- radius,
- buttons,
- cards,
- modal patterns,
- layout,
- interaction conventions.
Reuse existing components and design tokens.
Do not introduce a new visual language simply because a different pattern looks more impressive.
The goal is consistency, not novelty.
17. UI Changes Must Be Requirement-Driven
If the task is to connect existing appointment UI to real data, do not redesign it.
The implementation should prioritize:
1. Correct data.
2. Correct mutation.
3. Correct state.
4. Correct real-time behavior.
5. Correct loading/error handling.
6. Existing visual presentation.
Only change visual structure when the requirement actually requires it.
18. Separation of Concerns
Keep responsibilities separated.
Conceptually:
- Presentation: rendering and user interaction.
- Hooks: frontend lifecycle and interaction state.
- Model/rules: frontend-specific presentation rules.
- Data/API: transport and server contracts.
- Backend: business rules and authoritative state.
Do not allow presentation code to reach directly into infrastructure concerns when the architecture already provides an abstraction.
Do not create abstractions merely for ceremony.
The architecture should make responsibility obvious.
19. No Hard-Coded Domain Rules
Forbidden in frontend code:
- hard-coded consultation intervals,
- hard-coded queue formulas,
- hard-coded late thresholds,
- hard-coded call-count limits,
- hard-coded appointment lifecycle transitions,
- duplicate status enums that diverge from backend,
- fake fallback appointment records,
- magic strings representing backend business rules.
UI constants are acceptable when they are genuinely presentation-specific.
Domain policy is not a UI constant.
20. Testing Philosophy
Frontend testing must prioritize meaningful behavior.
High-value tests include:
- appointment list consumes real API data;
- patient detail opens the correct patient;
- call patient sends the correct command;
- loading state appears during mutation;# Backend Design Philosophy: Appointment and Queue

Audience: LLM coding agents working on the NestJS and PostgreSQL backend.
Scope: the appointment module (queue assignment, status lifecycle, calling patients, lateness) and the engineering rules that apply to every backend change.

How to use this document: treat every MUST and MUST NOT as a hard constraint. If the existing code conflicts with a rule, do not silently pick a side. State the conflict, propose the smallest change, and keep the existing convention only where this document is silent.

## 1. Prime Directives

1. The backend is the single source of truth. Every status, queue number, estimate, and lateness verdict is decided here and nowhere else.
2. Separate the plan from reality. Predictions order the queue. Staff actions record what actually happened.
3. Never invent behavior. If a case is not covered here or in the code, list it as an open question and ask.
4. Prefer the database over application code. A constraint, an index, or a better table beats a clever service.
5. Determinism over heuristics. A rule that cannot be evaluated the same way twice does not belong in the system.
6. Hard limits: 500 lines per file, no comments, no emojis.
7. No anxiety code. Know the types, know the impact, write it once, write it consistently.
8. Tests prove behavior, not existence. A test that passes on a broken implementation is a defect.
9. Never claim success without evidence. Report what was run and what was not.
10. Read the minimum, then edit. Do not spend tokens understanding what you already understand.

## 2. Working Method

- Targeted reads only: the status enum, the schedule policy table and its reader, the real-time event registry, the appointment controller, service, and repository, and the frontend callers of these endpoints. Locate with grep, open only the files you will change.
- Existing handlers and tests in the appointment module have never been verified by a human. Treat them as untrusted drafts. Verify behavior against this document, not against what the code claims.
- Before editing, name three things: the invariant being protected, the table or column that enforces it, and the test that proves it. If you cannot name all three, you do not understand the task yet.
- Database migrations are allowed and often preferable. Do not contort application code to avoid one.
- Keep the existing language of the codebase. Backend identifiers, enums, logs, and error codes are English. User-facing wording is the frontend's job.

## 3. Mental Model: Plan vs Reality

The system makes two different kinds of statements. Never mix them.

**Plan (prediction):** `queue_number`, `estimated_start_at`, `estimated_end_at`.
Computed once at assignment from the slot length in the schedule policy. It exists so each patient gets an order and an expectation. A queue cannot be numbered without an assumed duration per consultation, because the start of patient N+1 is undefined without the end of patient N. The 30-minute slot is that assumption and nothing more.

**Reality (observation):** `status`, `actual_started_at`, `actual_completed_at`, `last_called_at`.
Written only by explicit actions: a staff action, or the single deterministic lateness rule. Real consultations take 10, 30, or 45 minutes. Patients arrive early. Reality is allowed to diverge from the plan.

Rules:

- The plan MUST NOT mutate status, with one exception: the 24-hour lateness rule in Section 5.
- Reality MUST NOT rewrite the plan. Do not shift everyone's estimates because one consultation overran.
- Estimates are for display as approximate. They are never a promise and never a trigger.
- If an idea sounds like "the system should automatically move people forward", it is wrong unless this document says so.

## 4. Queue Assignment

- `queue_number` is assigned by the backend at booking, sequential per (doctor, appointment_date), starting at 1.
- The slot length comes from the schedule policy table. It MUST NOT be a constant in code. Find the existing policy reader and reuse it.
- Estimated times come from a pure function and are persisted at assignment as a snapshot. A later policy change affects new assignments only.
- The database arbitrates uniqueness with `UNIQUE (doctor_id, appointment_date, queue_number)`. Concurrent bookings are resolved by that constraint plus one retry, or by locking a per-doctor-per-day row inside the transaction. Never run `max() + 1` without one of these.
- Booking beyond the doctor's schedule window MUST be rejected by the rule the schedule module already has. Inspect it first. Do not create a second rule.
- `queue_number` is the default order and the ETA anchor. It is not a lock (see the out-of-order case in Section 7).

```ts
export function planSlot(input: {
  dayStart: Date;
  queueNumber: number;
  slotMinutes: number;
}) {
  const slotMs = input.slotMinutes * 60_000;
  const estimatedStartAt = new Date(input.dayStart.getTime() + (input.queueNumber - 1) * slotMs);
  const estimatedEndAt = new Date(estimatedStartAt.getTime() + slotMs);
  return { estimatedStartAt, estimatedEndAt };
}
```

The function does no I/O and reads no clock. That is what makes it trivially testable.

## 5. Status Model

Conceptual states. Map them onto the enum already in the codebase. Do not rename existing values.

| State | Meaning |
|-------|---------|
| WAITING | Booked and not yet in consultation. Includes patients who are physically present early. |
| IN_SERVICE | Staff started the consultation. |
| COMPLETED | Staff finished the consultation. |
| CANCELLED | Cancelled through the existing cancel flow. |
| LATE | Declared late by the deterministic rule. |

```ts
export const allowedTransitions: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  WAITING: ['IN_SERVICE', 'CANCELLED', 'LATE'],
  IN_SERVICE: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  LATE: [],
};
```

Triggers:

- WAITING to IN_SERVICE: staff action. Does not require `estimated_start_at` to have passed.
- IN_SERVICE to COMPLETED: staff action. Does not require the slot to have elapsed.
- WAITING to LATE: the lateness rule below. The only automatic transition in the system.

**Lateness rule.** A patient is LATE if and only if status is WAITING and now is at least 24 hours after the scheduled slot start. No call counting, no acknowledgement, no heuristics. Implementation preference:

1. An idempotent scheduled job running one conditional statement: `UPDATE ... SET status = 'LATE' WHERE status = 'WAITING' AND estimated_start_at <= now() - interval '24 hours'`.
2. Derivation at read time only if a job is impossible.

The job MUST be safe to run twice and safe after being down for a day.

**Enforcement.**

- Every status change goes through one use case method. Grep to prove no other code writes `status`.
- The write is conditional: `UPDATE ... WHERE id = $1 AND status = $expected`. Zero rows updated means `StaleStatusError`, mapped to HTTP 409.
- The matching timestamp is written in the same statement as the status.
- Do not add an arrival or check-in state unless the product asks. Early arrival is handled by staff moving WAITING to IN_SERVICE.

## 6. Calling Patients

- Calling is an action, not a status. It does not change `status`. It sets `last_called_at`, emits a real-time event, and triggers a push notification after commit.
- Calling is repeatable without limit. Staff decide when to stop. There is no three-call mechanism. A call log for audit is allowed because it is data. A call counter that influences any decision is forbidden.
- Calling is allowed only while WAITING. Any other state returns a typed domain error.
- Any WAITING patient may be called regardless of queue order.
- Patient acknowledgement, if the client reports one, is informational. It MUST NOT drive status.

**Push delivery.**

- Web Push: the Push API plus the Notifications API through a service worker, authenticated with VAPID keys. The `web-push` npm package is the usual server-side sender.
- The payload carries `title`, `body`, `tag` (the appointment id), `url`, and a vibrate pattern. The service worker passes these to `showNotification`.
- `renotify` requires a `tag`, so a repeated call buzzes again instead of silently replacing the previous notification.
- Vibration is decided by the OS and browser. Android Chromium honors it. iOS only delivers web push to installed home-screen web apps and ignores vibration patterns. Never promise vibration in product behavior.
- Push failure never rolls back state. A 404 or 410 from the push service means delete that subscription. Log everything else.

## 7. Edge Case Catalog

| Situation | Correct behavior | Forbidden |
|-----------|------------------|-----------|
| Patient arrives before the slot and the clinic is idle | Staff moves WAITING to IN_SERVICE now. `actual_started_at` is recorded. Queue numbers unchanged. | Renumbering, waiting for slot time, requiring `estimated_start_at <= now` |
| Consultation shorter than the slot | Staff moves to COMPLETED. Next patient stays WAITING until staff calls or starts them. | Auto-advancing, auto-calling, pulling later estimates forward |
| Consultation longer than the slot | Stays IN_SERVICE with no timeout. Later patients stay WAITING. | Auto-completing at slot end, marking the next patient late, rewriting estimates |
| Staff wants a later patient first | Allowed. Any WAITING patient can be started. | Rejecting because lower queue numbers are still WAITING |
| Patient does not respond to a call | Staff may call again, any number of times. Each call updates `last_called_at`, emits the event, sends push. | Counter that triggers LATE, blocking after N calls |
| Patient never shows | LATE once 24 hours past the slot start, via the deterministic rule. | Declaring LATE from missed calls or from the estimate drifting |
| Two staff act on one appointment | Conditional update. The loser gets 409. | Last write wins |
| Two patients book at once | Unique constraint decides. One retry or lock. | Duplicate queue numbers, unguarded `max() + 1` |
| Policy slot length changes | Affects new assignments only. Stored estimates stay. | Recomputing existing appointments |
| Push provider fails or subscription expired | State already committed. Remove dead subscriptions. Log the rest. | Rolling back status, failing the request |
| Real-time event missed | Client refetches. Events are hints, not a log. | Relying on event replay |
| Day boundary and timezone | Day boundaries computed in the clinic timezone from config. Timestamps stored UTC. | Server-local time, string date math |
| Appointment cancelled leaves a gap | Keep the gap by default. | Silent renumbering (confirm with the user, see Section 13) |
| Action on a non-WAITING appointment | Typed domain error mapped to a clear HTTP status. | Silent no-op, generic 500 |

## 8. Data and Consistency

- Expected columns on `appointments`: `queue_number`, `estimated_start_at`, `estimated_end_at`, `actual_started_at`, `actual_completed_at`, `last_called_at`, `status`, `updated_at`. Add only what is missing, through a migration.
- Indexes: the unique key from Section 4, `(doctor_id, appointment_date, status)` for list queries, and a partial index on WAITING rows for the lateness sweep.
- Prefer CHECK constraints for invariants: `actual_completed_at >= actual_started_at`, and IN_SERVICE implies `actual_started_at IS NOT NULL`. The database should refuse impossible rows even if the code is wrong.
- Timestamps are `timestamptz`. The clinic timezone comes from configuration. Inject a `Clock` port so tests control time.
- Queue assignment and every status transition are single transactions. Events and push are dispatched after commit.
- Do not add columns, tables, or flags for hypothetical needs.

## 9. Real-time

- Register new events inside the existing real-time module. Inspect its naming convention first and follow it.
- Event payloads are minimal: the appointment id, the new status, and `updated_at`. Clients refetch or patch from them.
- Emit after commit. Route staff-facing changes to the staff channel and the call event to the called patient.
- Do not build a second event bus on top of the existing module.

## 10. Architecture and Code Rules

```
controller         transport only: parse DTO, call one use case, map the result
use case           orchestration: transaction, clock, policy, repository, events
domain             pure functions and types: planSlot, transitions, lateness predicate
repository port    interface owned by the application layer
adapter            Postgres repository, push sender, real-time emitter, clock
```

- Dependencies point inward. Domain code imports nothing from NestJS or the database layer.
- Controllers contain no business branching. They validate input, call one use case, and map the output.
- Repository methods are named for intent (`transitionStatus`, `assignNextQueueNumber`), not generic CRUD sprawl.
- Ports exist only at real boundaries: database, clock, push, real-time. No interface for a thing with one trivial implementation and no boundary.
- One file, one reason to change. Split before 400 lines. Hard cap 500.
- No comments. Names carry the intent. No emojis in code, logs, messages, or docs.
- Guard clauses and early returns. Maximum nesting depth of 2. Lookup tables instead of if-else chains. async/await only, no callback pyramids.
- No `any`, no non-null assertions, no `as` casts to silence the compiler.
- Validate at the boundary once with DTOs, then trust the types.
- Typed domain errors, mapped to HTTP by a single exception filter. No empty catch. No catch that returns a default.

**Anxiety code** is code that doubts its own types and hides bugs behind fallbacks.

```ts
try {
  const result = await this.repo.find(id);
  if (result && result.status && typeof result.status === 'string') {
    return result.status || 'WAITING';
  }
} catch (e) {
  return null;
}
```

The consistent version knows what it has:

```ts
const appointment = await this.repo.getOrThrow(id);
return appointment.status;
```

**Over-engineering** to avoid: generic base classes, abstract factories, plugin systems, configuration flags for futures nobody asked for, a second event layer over the existing one, and service logic that a constraint or an index would handle.

## 11. Testing Philosophy

The point of automated tests is to make the human's manual test boring. If a human clicks through the flow and finds a bug, the tests failed their only job.

**What matters:** data in, data out, mutations, and state transitions. Not cosmetics, not that a function was called.

**Test at the level where behavior lives:**

- HTTP-level integration tests against a real PostgreSQL (a container or an isolated schema), driving real controllers with real seeded accounts.
- Assert on the response body, the persisted rows, and the emitted events.
- Pure unit tests are appropriate for `planSlot`, the transition table, and the lateness predicate, because those are pure logic.

**Required scenarios** (each row of the Section 7 catalog is one test, plus these):

- Sequential bookings get numbers 1, 2, 3 with estimates one slot apart, from the policy value in the database.
- Changing the policy changes only later bookings.
- Early start: a WAITING patient with a future slot moves to IN_SERVICE, with `actual_started_at` set and other rows untouched.
- Overrun: a patient stays IN_SERVICE past the slot, the next patient stays WAITING, nothing changes automatically.
- Calling five times changes no status, updates `last_called_at`, and emits five events.
- The lateness job marks only WAITING rows past 24 hours, leaves everything else, and is idempotent on a second run.
- Concurrent transitions: exactly one succeeds, the other gets 409.
- Concurrent bookings never produce a duplicate queue number.

**Test smells that are defects:**

- Asserting that a mock was called with no assertion on resulting data.
- Mocks that restate the implementation.
- Snapshot tests of trivial output.
- Assertions on constants such as a label or a color.
- Any test that stays green when the feature is deleted.

**Mutation sanity check.** After writing a test, break the implementation on purpose (flip a condition, drop the WHERE clause) and confirm the test fails. A test that cannot fail has proven nothing.

**Credentials.** A real-user test may need real accounts. Ask the user, or find them in the project's seed data or env files. Do not stub the auth guard to make a test pass.

**Existing tests.** For each existing appointment test, ask which bug it would catch. If the answer is none, delete or replace it.

## 12. Verification and Honesty Protocol

- Never write "100% working", "fully tested", or "all edge cases covered". Those claims have no evidence.
- A completion report contains four parts: what was run (exact commands), what passed, what was not verified, and known risks.
- Before reporting, open the test files you wrote and read the assertions. Confirm each one checks real data.
- Run a manual-equivalent journey and report its actual output: create appointments, call, start, complete, force a late case, and inspect the database after each step.
- If something could not be tested (missing credentials, no push device), say so. Never fill the gap with a green checkmark.

## 13. Open Questions (ask, do not guess)

1. Is LATE terminal, or can staff revive a late patient who arrives afterwards?
2. Is the 24-hour window measured from the slot start, or from the end of the appointment day? Default in this document: slot start.
3. On cancellation, keep the numbering gap or renumber? Default: keep the gap.
4. Should the system enforce at most one IN_SERVICE patient per doctor? Default: no enforcement.
5. Which staff roles may call, start, and complete?
6. Should the list endpoint return an `allowedActions` list per appointment so the frontend never encodes transition rules?

## 14. Implementation Plan

| Phase | Work | Exit evidence |
|-------|------|---------------|
| 0 | Short audit: status enum, policy reader, event registry, existing endpoints, existing tests worth keeping | Written findings, no code changes |
| 1 | Migration: missing columns, unique key, CHECK constraints, indexes | Migration applies and rolls back cleanly |
| 2 | Domain: `planSlot`, transition table, lateness predicate | Pure unit tests pass and fail under mutation |
| 3 | Use cases: assign queue number, transition, call, list and detail queries (filter by doctor, date, status) | Integration tests against real Postgres |
| 4 | Lateness job | Idempotency test, down-for-a-day test |
| 5 | Real-time events and web push dispatch after commit | Event assertions, push failure does not alter state |
| 6 | Full Section 7 catalog as integration tests | One passing test per row, each verified by mutation |
| 7 | Manual-equivalent journey and honest report | Report in the Section 12 format |

## 15. Pre-merge Checklist

- [ ] No file over 500 lines, no comments, no emojis
- [ ] Slot length read from the policy table, not hard-coded
- [ ] Only one code path writes `status`, and it is conditional
- [ ] No automatic transition other than the 24-hour lateness rule
- [ ] Calling never changes status and has no counter-driven logic
- [ ] Uniqueness and invariants enforced by the database
- [ ] Events and push dispatched after commit
- [ ] Every Section 7 row has a test that fails when the behavior is broken
- [ ] The completion report lists what was not verified# Frontend Design Philosophy: Appointment Page

Audience: LLM coding agents working on the Next.js frontend.
Scope: the patient appointment page (list, detail, call patient), how it consumes backend state and real-time events, and the engineering rules that apply to every frontend change.

How to use this document: treat every MUST and MUST NOT as a hard constraint. If the existing code conflicts with a rule, do not silently pick a side. State the conflict, propose the smallest change, and keep the existing convention only where this document is silent.

## 1. Prime Directives

1. The frontend consumes. The backend decides. Status, queue numbers, estimates, and lateness come from the backend and are displayed as received.
2. The UI is frozen. Reuse the existing components, theme, fonts, spacing, and layout. The design was built with effort and you do not own it.
3. Presentation components contain zero logic. They render props and call functions handed to them by hooks.
4. All logic lives in hooks and pure modules. Components import it, they do not implement it.
5. Hide complexity, show outcomes. The users are not technical.
6. One vocabulary for status, defined in one place.
7. The existing appointment page data is fake or wrong until proven otherwise. It has never been manually tested.
8. Hard limits: 500 lines per file, no comments, no emojis, no `any`.
9. Tests verify data and mutations, not colors and hover states.
10. Never claim success without evidence. Report what was run and what was not.

## 2. Working Method

- Targeted reads only: the appointment page and its components, the existing data-fetching setup, the real-time client hook, the status labels already in use, and the backend DTO or OpenAPI types. Locate with grep, open only what you will change.
- The page template exists but its data is placeholder. Find every hard-coded array, mock, and stub on that page and treat each one as a defect to remove.
- Existing handlers were never verified against a real backend. Check each one against the real endpoint response, not against its own types.
- Do not introduce a new state library, UI kit, or styling approach. Use what the project already uses.
- When you already know what to change, edit directly. Do not read the whole feature folder to feel safe.

## 3. Mental Model: A Window, Not a Brain

The frontend is a window onto backend state. It never makes domain decisions.

| The frontend MUST NOT compute | The frontend MAY do |
|-------------------------------|---------------------|
| Queue numbers and order | Format dates and times in the clinic timezone |
| Estimated times | Map backend codes to display labels |
| Whether a status change is valid | Debounce or disable a button while its request is pending |
| Whether a patient is late | Keep list order exactly as the backend returned it |
| Who is next | Subscribe to events and patch or refetch state |

If the UI needs an `if (status === ...)` to decide which button to show, the backend contract is incomplete. Ask for a field such as `allowedActions` instead of encoding transition rules in the UI.

## 4. Layering

```
page (route)            composes components, owns nothing
presentation component  renders props, calls handlers it was given
management hook         state, queries, mutations, real-time subscription
api client              typed HTTP calls, nothing else
mapper                  backend DTO to view model, pure functions
```

Dependencies flow downward only. A component never imports an api client. A mapper never imports React.

Suggested placement (follow the existing folder structure if it differs):

```
features/appointments/
  api/        typed endpoint functions
  hooks/      useAppointmentList, useAppointmentDetail, useCallPatient, useAppointmentRealtime
  mappers/    toAppointmentRow, toAppointmentDetail
  components/ presentation only
  types/      DTOs and view models
```

Illustrative shapes. The example assumes TanStack Query, so use whatever the project already uses.

```ts
export type AppointmentRow = {
  id: string;
  patientName: string;
  doctorName: string;
  queueNumber: number;
  estimatedTimeLabel: string;
  statusLabel: string;
  canCall: boolean;
};

export function toAppointmentRow(dto: AppointmentDto): AppointmentRow {
  return {
    id: dto.id,
    patientName: dto.patient.fullName,
    doctorName: dto.doctor.name,
    queueNumber: dto.queueNumber,
    estimatedTimeLabel: formatClinicTime(dto.estimatedStartAt),
    statusLabel: statusLabel[dto.status],
    canCall: dto.allowedActions.includes('CALL'),
  };
}
```

```ts
export function useAppointmentList(filter: AppointmentFilter) {
  const query = useAppointmentQuery(filter);
  useAppointmentRealtime(query.refetch);
  const rows = useMemo(() => (query.data ?? []).map(toAppointmentRow), [query.data]);
  return { rows, isLoading: query.isLoading, error: query.error };
}

export function useCallPatient() {
  const mutation = useMutation({ mutationFn: callPatient });
  return { call: mutation.mutate, isCalling: mutation.isPending };
}
```

```tsx
export function AppointmentTable({ filter }: { filter: AppointmentFilter }) {
  const { rows } = useAppointmentList(filter);
  const { call, isCalling } = useCallPatient();
  return (
    <ExistingTable>
      {rows.map((row) => (
        <ExistingRow
          key={row.id}
          row={row}
          onCall={() => call(row.id)}
          callDisabled={!row.canCall || isCalling}
        />
      ))}
    </ExistingTable>
  );
}
```

`ExistingTable` and `ExistingRow` stand for the components the template already has. The component contains no branching on business rules and no data shaping.

## 5. UI Freeze

- MUST NOT change colors, fonts, spacing, radii, shadows, breakpoints, or layout of existing screens.
- MUST NOT add new visual patterns where an existing component serves. Search the component library first.
- MUST use the existing loading, empty, and error components.
- A new element is allowed only when the feature cannot exist without it, and it MUST reuse existing tokens and components.
- The goal of this work is correct data and behavior inside the existing design. If a task seems to need a redesign, stop and ask.

## 6. Status and Language

- The backend sends English enum codes. The app speaks Indonesian to users. Keep that boundary: codes inside, Indonesian labels outside.
- Define the status vocabulary once, as an exhaustive record, so a new backend status is a compile error and not a blank cell.
- Look at the labels the app already uses and reuse their wording. Do not invent a second vocabulary. The example below shows the shape, not the final words.

```ts
export const statusLabel: Record<AppointmentStatus, string> = {
  WAITING: 'Menunggu',
  IN_SERVICE: 'Sedang dilayani',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
  LATE: 'Terlambat',
};
```

- Status colors and badge variants come from the existing badge component's variants. Do not add new colors.
- A raw backend code (`IN_SERVICE`, `STALE_STATUS`) MUST NEVER reach the screen.

## 7. Copy and Abstraction

The people using this are clinic staff and patients, not engineers. Backend complexity stays behind the screen.

- Say what happened, in plain Indonesian. "Pasien dipanggil" and not "Notification dispatched".
- Never expose terms such as state machine, payload, sync, event, version, conflict, or idempotent.
- No corporate buzzwords, no decorative phrases, no marketing tone. Short, concrete, useful.
- Estimates are always labeled approximate (for example "Perkiraan 09.30"). They are never shown as commitments.
- Errors name the situation and the next step, not the cause in the system. For a 409: "Status pasien sudah berubah, data sudah diperbarui." No codes, no stack traces.
- Do not leak backend structure into the UI structure. The screen is organized around what the user wants to do.

## 8. Appointment Page Specification

**List.** One row per appointment. Essential data only: patient, queue number, doctor, approximate time, status. Reuse whatever filters the template already has (doctor, date, status). Order is exactly as the backend returns it.

**Actions per row.**

- View detail.
- Call patient. Available only when the backend says it is allowed.

**Detail.** Opens in the existing detail surface (modal or page, whatever the template uses) and shows the same essential data plus the patient information the backend provides.

**Call patient.**

- Sends one request to the call endpoint and shows a short confirmation such as "Pasien dipanggil".
- The button is disabled only while its own request is pending. There is no client-side cap on repeated calls, because the backend allows calling as often as staff want.

**Patient side.** The patient-facing call modal already exists. Keep it. A repeated call re-triggers it. Dismissing it is local only and does not change appointment state.

**Start and complete actions.** Staff move patients to "being served" and "completed". Where those controls live in the current UI is unknown, so inspect first. Wire the existing control if one exists. Do not add new UI chrome without approval (see Section 14).

## 9. Edge Case Catalog

| Situation | Correct behavior | Forbidden |
|-----------|------------------|-----------|
| Page opens with no appointments | Existing empty state | Blank table, placeholder rows |
| Real-time connection drops and returns | Refetch on reconnect and on window focus | Trusting that no event was missed |
| Staff double-clicks Call | Button disabled while the request is pending | Sending duplicates, or locking the button permanently |
| Backend returns 409 on an action | Refetch, show the plain message from Section 7 | Showing the error code, keeping stale rows |
| Early patient served out of order | Display backend order and status as received | Re-sorting by queue number, hiding the row |
| Consultation overruns | Later rows still show approximate times, nothing is flagged | Marking later patients late from the estimate |
| Patient is LATE | Show it only when the backend status says LATE | Computing lateness from time on the client |
| Two admins on the same page | Real-time events refresh the row | Optimistic changes that diverge from the server |
| Push permission denied or unsupported | Degrade quietly. The in-app call modal still works. | Repeated permission nagging, a broken page |
| Called patient is not on the page | Event and push still reach them | Depending on the page being open |
| Estimated time near midnight or other timezone | Format in the clinic timezone from config | Browser-local formatting |
| Backend adds a new status | Compile error from the exhaustive record | Blank label or silent fallback text |
| Template still contains mock data | Remove it, bind real data | Leaving fake rows "for layout" |

## 10. Real-time and Push on the Client

**Real-time.**

- Use the existing real-time client. Do not open a second connection.
- Subscribe inside a hook, never inside a component. Unsubscribe on unmount.
- On an event, refetch or patch the affected row from the minimal payload (id, status, updated time). The server state wins every time.

**Web push.**

- Register a service worker, then call `PushManager.subscribe` with the VAPID public key, and send the subscription to the backend.
- Ask for notification permission only after a user gesture, with a plain explanation.
- The service worker shows the notification. A repeated call re-notifies because the notification carries the same `tag` and `renotify` is on.

```js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      renotify: true,
      requireInteraction: true,
      vibrate: [300, 150, 300, 150, 300],
      data: { url: data.url },
    })
  );
});
```

- Vibration is a request, not a guarantee. Android Chromium honors the pattern. iOS needs the app installed to the home screen for push and ignores vibration. `navigator.vibrate` works only in a visible page on supporting browsers, so use it as an extra and never as the mechanism.
- Never promise vibration in UI copy.

## 11. Code Rules

- TypeScript strict. No `any`, no non-null assertions, no casts to silence the compiler.
- Components are small and read like markup. Anything that decides, computes, or fetches moves to a hook or a mapper.
- Hooks are single-purpose and return data, flags, and action functions. They contain no JSX.
- Mappers are pure functions from backend DTO to view model. They import no React and perform no I/O.
- Guard clauses and early returns. Maximum nesting depth of 2. No nested ternaries. Prefer lookup records over if-else chains.
- Do not derive state in `useEffect`. Compute it during render, or in a mapper.
- Parse the backend response once at the boundary, using the validation library the project already has. After that, trust the types.
- No comments. Names carry the intent. No emojis anywhere.
- Split before 400 lines. Hard cap 500.

**Anxiety code** hides contract errors behind optional chaining and defaults:

```ts
const name = data?.items?.[0]?.patient?.fullName ?? '';
```

If the contract guarantees `patient`, validate once at the boundary and then write `dto.patient.fullName`. A missing field should fail loudly in development, not render as an empty string.

## 12. Testing Philosophy

The goal is that when a human clicks through the page, nothing is broken. Test what the user does and what the data does.

**Test:**

- Mappers: real backend response fixtures in, view models out. Include every status and every edge case in Section 9.
- Hooks: network mocked only at the HTTP boundary, with fixtures captured from the real backend. Assert the returned rows, the request sent, and the state after the response.
- Page flows: render the page, assert the displayed rows match the fixture data (names, queue numbers, doctors, status labels), click Call, assert the correct request went out for the correct id, and assert the UI reflects the result.
- Real-time: feed an event, assert the affected row updates.
- 409 handling: assert the refetch and the plain message.
- End-to-end with Playwright against a real running backend and seeded accounts: staff logs in, sees data that matches the database, calls a patient, and the patient session receives the call. Assert on server state after the action, not only on pixels.

**Do not test:** colors, class names, hover effects, pixel layout, or markup snapshots. Those matter later and never ahead of data correctness.

**Mutation sanity check.** After writing a test, break the code on purpose (swap a label, change an id, drop a request) and confirm the test fails.

**Credentials.** If a real-user test needs accounts, ask the user or find them in seed data and env files. Do not bypass login in the test to make it pass.

## 13. Verification and Honesty Protocol

- Never write "100% working", "fully tested", or "all cases covered".
- A completion report has four parts: exact commands run, what passed, what was not verified, and known risks.
- Before reporting, open the tests you wrote and read the assertions. Each must check real data or a real mutation.
- Run the page against the real backend and report what the screen showed. Mock-only runs are labeled as mock-only.
- If something could not be verified (no push device, no credentials), say so plainly.

## 14. Open Questions (ask, do not guess)

1. Where do the "start service" and "complete" controls live in the current UI, and does the existing template already include them?
2. Will the backend expose `allowedActions` per appointment, or should the UI be given another way to know when Call is available?
3. What exact Indonesian wording does the app already use for each status?
4. Which roles see the list, and does the patient-facing view share any of these components?

## 15. Implementation Plan

| Phase | Work | Exit evidence |
|-------|------|---------------|
| 0 | Short audit: page template, mock data, existing labels, data-fetching setup, real-time hook, backend types | Written findings, no code changes |
| 1 | Types and api client matching the real endpoints, validated at the boundary | Calls succeed against the real backend |
| 2 | Status dictionary and mappers | Mapper tests with real fixtures |
| 3 | Management hooks: list, detail, call, real-time | Hook tests, request and state assertions |
| 4 | Bind the existing presentation components to hooks and delete all mock data | Page shows real database rows |
| 5 | Push registration and service worker | Subscription stored in backend, notification received on a device |
| 6 | Section 9 catalog as tests, plus Playwright flow against a real backend | One passing test per row, each verified by mutation |
| 7 | Manual-equivalent run and honest report | Report in the Section 13 format |

## 16. Pre-merge Checklist

- [ ] No file over 500 lines, no comments, no emojis, no `any`
- [ ] No visual change to existing screens
- [ ] Components contain no logic, only hook output and handlers
- [ ] No status, queue, estimate, or lateness computed on the client
- [ ] One status dictionary, exhaustive, with wording consistent with the app
- [ ] No raw backend codes or technical terms visible to users
- [ ] All mock data removed from the page
- [ ] Real-time handled in a hook with refetch on reconnect
- [ ] Every Section 9 row has a test that fails when the behavior is broken
- [ ] The completion report lists what was not verifiedIsinya paradigma, katalog edge case, aturan kode, filosofi testing, dan plan implementasi per fase. Aku cuma cek panjang file dan ada tidaknya emoji, belum ada tes atau implementasi yang dijalankan.

Ide intinya di backend: plan vs reality. Nomor antrian dan estimasi waktu adalah prediksi yang dihitung sekali dari policy 30 menit di database, sedangkan status adalah catatan kejadian nyata yang hanya diubah lewat aksi admin. Dengan begitu pasien datang kecepetan atau konsultasi kelamaan tidak merusak apa-apa. Satu-satunya transisi otomatis adalah menunggu ke telat setelah 24 jam. Panggil pasien tidak mengubah status, boleh diulang tanpa batas, dan tidak ada hitungan tiga kali.

Soal pertanyaanmu tentang web push: pakai Push API + Notifications API lewat service worker, dengan VAPID key, dan di server pakai library web-push. Getaran diminta lewat opsi vibrate di showNotification, tapi itu cuma permintaan. Android Chrome biasanya menurut, sedangkan iOS cuma kirim push ke web app yang di-install ke home screen dan mengabaikan pola getaran. Jadi jangan dijanjikan ke user.

Beberapa hal sengaja kutulis sebagai open questions di akhir tiap dokumen, supaya AI nanya dulu dan tidak menebak:

Apakah status telat bersifat final, atau admin bisa membukanya lagi kalau pasiennya muncul?
Hitungan 24 jam dari jam mulai slot atau dari akhir hari? Defaultku jam mulai slot.
Kalau ada pasien batal, nomor antrian yang kosong dibiarkan atau dirapikan? Defaultku dibiarkan.
Di UI sekarang, tombol "mulai dilayani" dan "selesai" ada di mana?
Backend sebaiknya kirim allowedActions per appointment, supaya frontend tidak menyimpan aturan transisi status.
- server error is surfaced correctly;
- successful mutation reconciles with backend state;
- real-time event updates the correct appointment;
- stale local state does not override canonical state;
- status presentation matches the backend contract.
Lower-priority tests include purely visual implementation details such as:
- exact hover behavior,
- arbitrary CSS class assertions,
- internal component structure,
- color implementation details when semantic state is already tested elsewhere.
Visual tests still have value, but they are not evidence that the appointment domain works.
21. Testing Must Reflect Real User Behavior
The agent must test the workflow a human actually performs.
Example:
Open Appointment -> Find Patient -> View Detail -> Call Patient -> Observe Mutation -> Observe Real-Time Update
Do not test only:
render(<AppointmentCard />)
and then claim the appointment workflow is verified.
If credentials, running services, browser permissions, push configuration, or a specific account are required, request or obtain them through the available legitimate mechanism.
Never fabricate successful manual verification.
22. No Fake Data as a Substitute for Integration
Mock data may be appropriate for isolated component tests.
It must not be used to claim that the actual appointment module works.
When validating integration:
- use real API contracts;
- use realistic persisted data;
- verify actual mutations;
- verify actual response payloads;
- verify actual real-time behavior.
A visually correct screen populated by invented data is not an integrated appointment feature.
23. No Anxiety Code in Frontend
Avoid:
- nested conditional rendering that hides state problems,
- excessive fallback chains,
- duplicated status checks,
- silent error recovery,
- arbitrary default values,
- local reconstruction of server state,
- defensive transformations without a known contract reason.
If the backend contract says a field is required, model it as required.
If the backend contract changes, update the contract and consumers deliberately.
Do not hide contract violations behind ?? "Unknown" everywhere.
24. Code Size and Maintainability
Keep files focused.
A file should remain at or below approximately 500 LOC.
Do not split code mechanically just to satisfy the limit.
Split when responsibilities differ.
Avoid:
- God components,
- God hooks,
- giant page components,
- circular imports,
- callback pyramids,
- deeply nested conditional logic.
Prefer small, composable modules with explicit responsibilities.
25. LLM Anti-Hallucination Rules
The coding agent must never claim:
"The appointment page works."

merely because:
- the route exists,
- the component renders,
- the API handler exists,
- a unit test passes,
- a mock response works,
- a websocket handler exists.
The agent must distinguish:
- implemented,
- statically inspected,
- unit-tested,
- integration-tested,
- manually verified,
- real-time verified.
Only claim the strongest level that was actually demonstrated.
If something has not been manually exercised, explicitly treat it as unverified.
26. Definition of Done
The appointment frontend is complete when:
- the existing UI is preserved;
- real backend data populates the page;
- patient detail uses canonical data;
- call patient triggers the real backend mutation;
- loading and error states are visible;
- real-time updates reconcile correctly;
- backend status is displayed consistently;
- no business rules are duplicated in presentation;
- queue numbers are consumed, not calculated;
- predicted schedule is not confused with actual operation;
- Web Push is treated as notification, not attendance truth;
- no fake data is used as integration evidence;
- meaningful workflows have been tested;
- visual polish does not substitute for domain correctness.
The frontend should make the backend's truth understandable without exposing the backend's complexity.