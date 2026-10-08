# Prompt Migrasi untuk Agen LLM (Gemini)

**Cara pakai**

1. Salin semua isi **di bawah garis `BEGIN PROMPT`** sampai akhir file ke agen Anda.
2. Beri agen akses **read-only** ke database (idealnya salinan atau branch, bukan produksi), dan akses ke repo backend serta frontend.
3. Agen bekerja per fase dan **berhenti di setiap gerbang**. Baca laporannya, lalu balas `APPROVE PHASE N` untuk lanjut. Fase 0 dan 1 tidak mengubah apa pun.
4. Prompt sengaja berbahasa Inggris dan **tidak mengasumsikan nama tabel Anda**, karena skema Anda belum saya lihat. Itulah sebabnya agen wajib memindai dulu sebelum merancang apa pun.
5. Satu perbedaan dari dokumen sebelumnya: kategori layanan (umum, bidan) dan sesi dijadikan **data**, bukan `CHECK` atau enum. Ini konsekuensi aturan "tidak boleh hard-coding".
6. Data di database masih berupa **data seeding** (bukan data pasien nyata), jadi aman dihapus, di-reset, atau di-seed ulang. Prompt sudah disesuaikan: backfill menjadi opsional. Tetap tulis migrasi skema dengan rapi, karena skemanya nanti akan dipakai di produksi.

---

# BEGIN PROMPT

# MISSION

You are a senior database and backend migration engineer. You will migrate a small clinic's appointment system from a **slot-booking model** to a **queue-ticket model**.

The target system must be:

- **Configuration-driven**: nothing that a clinic owner could reasonably want to change is hard-coded.
- **Decoupled**: modules talk through narrow interfaces, with a pure domain core.
- **Backward compatible** with a frontend that is already wired to existing endpoints, wherever that is genuinely possible. Where it is not, keep the legacy shape alive through a backend compatibility layer that is synchronized from the new model.

You work in **phases with approval gates**. You never assume the shape of the existing database or code. You **scan first**.

---

# 0. OPERATING PROTOCOL (read this twice)

## 0.1 Phases and gates

| Phase | Name | Writes anything? |
|---|---|---|
| 0 | Discovery | **No. Read-only.** |
| 1 | Gap analysis and plan | **No.** |
| 2 | Expand (additive migrations, seed config, backfill) | Yes, additive only |
| 3 | Compatibility layer | Yes |
| 4 | Backend implementation | Yes |
| 5 | Frontend change specification (and changes, if asked) | Yes |
| 6 | Verify, roll out, contract (cleanup) | Yes |

At the end of every phase: output the deliverable defined for that phase, then **STOP**. Continue only after the human replies `APPROVE PHASE <n>`.

## 0.2 Evidence rules

- Never invent a table, column, index, function, endpoint, file, or config key. If you did not **observe** it in a query result or file, it does not exist for you yet.
- Every statement about the existing system must carry **evidence**: the exact query or file path (with line numbers when possible) where you saw it.
- Maintain an **Assumption Ledger** with three statuses: `VERIFIED`, `UNVERIFIED`, `CONTRADICTED`. Restate it at the start of every phase. Do not build on `UNVERIFIED` items without saying so.
- If something is unknown, write `UNKNOWN` plus the exact query or file you need.
- If the clinic owner's description in this prompt contradicts what you observe, **report the conflict**. Do not silently adapt.
- Before each migration file, include a **pre-check block** that asserts every assumption the file depends on (tables, columns, row counts) and aborts if any is false.

## 0.3 Safety rules

- Say which environment you are connected to before doing anything.
- **Data status: the data in this database is seed (dummy) data, not real patient data.** Deleting, resetting, or re-seeding **data** is safe and allowed, and keeping it is equally fine. Verify this in Phase 0 (environment name, row counts, obviously synthetic values). If you find evidence of real patient data or a production environment, **STOP and report** before doing anything else.
- **Schema changes stay disciplined even though the data is disposable.** The migration files you write will later run against production, so they must be correct, idempotent, and reversible. Destructive **schema** changes (dropping tables, columns, or views that the frontend or legacy endpoints still use) wait until Phase 6 and explicit approval, because the frontend is wired to them. This restriction exists for compatibility, not for data safety.
- Every migration file: one concern per file, **idempotent** (`IF NOT EXISTS` or equivalent), transactional where the engine allows, with an `up` and a `down`, followed by a **post-check** (row counts, invariants).
- Never log or print patient personal data. When you need samples, show structure and counts, or masked values.
- Keep each phase's output structured: tables, checklists, and file lists. No long prose.

## 0.4 Questions

Ask questions only at gates, **batched in one list**. For every question, propose a default so you are never blocked.

## 0.5 Scope discipline

Build the simplest thing that satisfies the rules in this document. Do **not** build speculative features: per-doctor duration models, multi-clinic support, patient-chosen doctors, payment, and so on. You may leave extension points through configuration, but do not implement them.

---

# 1. CONTEXT (owner's description: hypotheses to verify, not facts)

- A small clinic. Two service categories today, general (`umum`) and midwife (`bidan`). Around four rooms (Umum 1, Umum 2, Bidan 1, Bidan 2) and two to five doctors. The number may grow, so the design must scale by adding data, not code.
- Sessions per day: early morning, morning, afternoon, evening.
- Walk-in patients are always served. The online system must behave the same way: **the patient is always accepted**.
- The current online booking wizard shows doctor, room, start and end time, and per-session total slots, and it **disables** sessions based on doctor availability and room occupancy. This makes patients leave the system. This is the core problem.
- A **30-minute policy** exists in the database (location unknown: could be a `CHECK`, trigger, default, function, config row, RLS policy, or application code). Find it and report exactly where it lives. Actual service start and end times are already recorded in the data (verify).
- Doctors currently must create their own schedules. If a doctor creates none, no sessions exist and the whole queue paradigm breaks.
- Room collisions are a concern: several doctors, shared rooms.
- **The data currently in the database is still seed data** (no real patients). It is safe to delete, reset, or re-seed. Confirm this in Phase 0.
- The frontend is already wired to existing endpoints.
- Reschedule is rarely used. Closures are needed at three levels: whole day, session, and time range.

---

# 2. NON-NEGOTIABLE PRINCIPLES

**P1. No hard-coding.** Categories, sessions, session times, durations, thresholds, tolerances, labels, message texts, timezone, locale, ticket code format, and notification channel all live in **data or configuration**. Code may contain algorithm structure and the state machine only. If a required config key is missing, **fail loudly with the key name**. Never silently fall back to a literal in code. Defaults live in a seed migration, not in code.

**P2. Decoupled.** Dependency direction is one way: `Config ← Calendar ← Capacity ← Estimator/Simulator ← Queue Engine ← API and Adapters`. Nothing depends upward. The domain core has **no imports** from the web framework, ORM, or HTTP layer.

**P3. Pure core, thin edges.** Domain functions take data in and return decisions. All I/O sits in repositories and adapters. Business logic does **not** live in database triggers. Database constraints are used only for integrity (unique indexes, foreign keys).

**P4. The patient is never blocked.** Capacity limits produce a longer estimate or an automatic redirect to the next open session or day. They never produce a disabled control or a rejection. The only hard stops are listed in section 7.1.

**P5. Separate three things:** the **order** (ticket number, never changes), the **status** (explicit actions by staff, never inferred from time), and the **estimate** (a best guess, recomputed on events). Uncertainty only ever affects the estimate.

**P6. One source of truth.** The new model is the source of truth. Legacy structures are a **one-way projection** from the new model. **Never build two-way sync.** Writes arriving through legacy endpoints are translated and sent through the new engine.

**P7. Expand, migrate, contract.** Add first, move traffic second, remove last. Removal needs explicit human approval and proof that nothing uses the legacy path.

**P8. Time semantics.** Store `timestamptz` (UTC). Interpret in the clinic timezone from config. Intervals are **half-open** `[start, end)`. All timestamps use **server time**, never client time.

**P9. Tickets are never deleted.** They change status. Pointers (`moved_to`) preserve history.

---

# 3. PHASE 0: DISCOVERY (read-only)

Your goal is to produce a **Discovery Report** that is accurate and evidence-backed. Do not design anything yet.

## 3.1 Database scan

1. Detect the engine and version, extensions available, and whether row-level security or policies are in use.
2. Introspect: schemas, tables, columns (types, nullability, defaults), primary and foreign keys, unique constraints, check constraints, indexes, **triggers**, **functions and procedures**, **views**, sequences, and **policies**.
3. Row counts per relevant table. Date ranges of the main records. Distinct values of category-like and session-like columns.
4. Identify the concepts below. For each, name the table and column that implements it, or write `NOT FOUND`:
   - patient, doctor, room, service category, session, appointment or booking record, queue number, status
   - planned start and end time, **actual** start and end time, in-service marker
   - doctor schedule, availability, slot capacity, "disabled" logic
   - the **30-minute policy** (exact location and mechanism)
5. Data quality probe (counts only): records with `end <= start`, missing actual times, durations under 2 minutes or over 120 minutes, orphaned foreign keys, duplicate queue numbers.
6. Business logic hiding in the database: list every trigger, function, view, and policy that touches booking, slots, rooms, or doctors. Describe what each does in one line.

## 3.2 Backend scan

1. Identify the language, framework, ORM or query layer, migration tool, test setup, and configuration mechanism.
2. List **every endpoint** related to booking, availability, queue, doctors, rooms, sessions, and schedules: method, path, auth, request shape, response shape, and which tables it touches.
3. Locate where the 30-minute rule, slot counting, "disabled" logic, queue number assignment, and room or doctor conflict checks are implemented (file and line).
4. Find hard-coded constants and literals that the target design says must be configuration (category names, session names and times, durations, labels). List them with locations.

## 3.3 Frontend scan

1. Identify the framework and the API client layer.
2. List every API call the frontend makes to the endpoints above: which screen, which fields it reads, which fields it writes.
3. List which fields on screen are shown to the patient today (doctor, room, start and end time, total slots, disabled sessions) and which screens are patient-facing versus admin-facing.
4. List hard-coded categories, sessions, labels, and numbers in the frontend.

## 3.4 Golden samples (for backward compatibility tests)

For each existing endpoint, capture one **real request and response sample** (from tests, fixtures, logs, or a dev environment). Mask personal data. Store them under a `compat-golden/` folder. These become contract tests in Phase 3.

## 3.5 Deliverable: Discovery Report

Use exactly this structure:

1. **Environment** (engine, version, which DB you connected to, read-only confirmation)
2. **Concept map** (table: concept, implemented by, evidence, status `VERIFIED` or `UNVERIFIED`)
3. **The 30-minute policy** (where, how, what depends on it)
4. **Hidden logic inventory** (triggers, functions, views, policies)
5. **Endpoint inventory** (table)
6. **Frontend call inventory** (table)
7. **Hard-coded constants inventory** (table: location, value, target config key)
8. **Data quality findings** (counts only)
9. **Assumption Ledger**
10. **Conflicts with the owner's description**

Then **STOP** and wait for `APPROVE PHASE 1`.

---

# 4. TARGET DESIGN (the specification you will plan against)

## 4.1 Vocabulary

| Term | Meaning |
|---|---|
| Category | A service line (for example general, midwife). A row of data. |
| Session | A named part of the day (early morning, morning, afternoon, evening). A row of data with weekly times. |
| Ticket | The patient's place in the queue for a (date, category, session). Has a number, status, and estimate. Does **not** own a doctor or room until called. |
| Lane | One doctor with a room, serving at one time. Capacity of a category at time `t` = number of lanes. |
| Closure | An interval in which the clinic (or a category, doctor, or room) does not serve. |
| Call | The action of calling the next ticket into a specific room. This is when doctor and room get assigned. |

## 4.2 Patient-visible versus internal (enforced on the server)

| Data | Patient | Internal |
|---|---|---|
| Ticket code and number | Yes | Yes |
| Category, date, session | Yes | Yes |
| People ahead count | Yes | Yes |
| ETA as a rounded **range** | Yes | Yes |
| Status in plain language | Yes | Full |
| Room | **Only when status is called** | Always |
| Doctor name | **Only when called, and only if config allows** | Always |
| Projected end time | **Never** | Yes |
| Total slots, capacity, load ratio, lanes | **Never** | Yes |
| Disabled sessions | **Do not exist** | n/a |
| Priority, source, actual times, notes | **Never** | Yes |

Rules:

- The server returns two distinct view models. Hiding fields in the UI is **not** sufficient.
- If the database uses row-level policies, patients read tickets only through a **dedicated view** with whitelisted columns.
- Patient-facing text comes from a **message catalog** (message key to text, default locale from config). No literal strings in logic.

## 4.3 Master components and boundaries

| Component | Responsibility | Depends on |
|---|---|---|
| **Config** | Typed settings with scope resolution (see 4.4). The only way code reads a tunable. | none |
| **Calendar** | Effective open segments: `(session schedule ∪ extra openings) − closures`. Exposes `isOpen`, `nextOpen`. | Config |
| **Capacity** | `lanes(category, t) = min(doctors on duty, rooms in category)` minus doctor and room closures. | Calendar |
| **Duration Estimator** | Expected service duration from actual data, shrunk toward a configured prior. | Config |
| **Simulator** | Multi-lane simulation to produce each waiting ticket's projected start and whether it fits. | Calendar, Capacity, Estimator |
| **Queue Engine** | Ticket issuance, numbering, ordering, state machine transitions, call, check-in, cancel, expire. | Simulator |
| **Closure and Reschedule Engine** | Preview and commit of closures. Reschedule as cancel plus reissue. | Queue Engine |
| **View Mapper** | `toPatientView`, `toAdminView` (whitelists). | Config |
| **Notification Outbox** | Records "notify X about Y". A separate worker delivers through the configured channel. | Config |
| **Compat Adapters** | Legacy endpoints translated onto the new engine. | everything above |
| **Jobs** | Sweep, expire, day close, statistics refresh. Thin wrappers over engine functions. | Queue Engine |

## 4.4 Configuration registry (data, not code)

A single `clinic_setting` table: `key`, `scope_type` (`global`, `category`, `session`), `scope_id` (nullable), `value` (JSON), `updated_at`. Resolution: most specific scope wins (`session` over `category` over `global`).

Seed these keys (values are **proposed defaults** for the owner to review):

| Key | Type | Meaning | Default |
|---|---|---|---|
| `clinic.timezone` | string | IANA timezone | `Asia/Jakarta` |
| `clinic.locale` | string | Default message locale | `id-ID` |
| `duration.prior_minutes` | int | Prior (the old 30-minute value) | 30 |
| `duration.prior_weight` | int | Weight of the prior vs real data | 10 |
| `duration.valid_min_minutes` | int | Drop shorter durations from statistics | 2 |
| `duration.valid_max_minutes` | int | Drop longer durations from statistics | 120 |
| `duration.window_days` | int | Statistics window | 30 |
| `duration.min_samples` | int | Minimum samples to use a segment | 20 |
| `duration.stale_factor` | number | In-service flagged when over this multiple of average | 2.0 |
| `duration.min_remaining_minutes` | int | Remaining time floor for an over-running patient | 5 |
| `queue.overflow_tolerance_minutes` | int | Soft tolerance past normal session end | 30 |
| `queue.search_horizon_days` | int | How far ahead to search for an open session | 14 |
| `queue.no_show_grace_minutes` | int | Wait before marking no-show | 10 |
| `queue.no_show_call_attempts` | int | Calls before no-show | 2 |
| `queue.load_ratio.ok_max` | number | Ratio up to which load is "smooth" | 0.9 |
| `queue.load_ratio.busy_max` | number | Ratio up to which load is "busy" | 1.1 |
| `queue.arrive_early_minutes` | int | "Please arrive N minutes before" hint | 15 |
| `eta.display_round_minutes` | int | Rounding of displayed ETA | 5 |
| `eta.update_threshold_minutes` | int | Redisplay only if ETA moves at least this much | 10 |
| `eta.notify_delay_minutes` | int | Notify patient if ETA slips at least this much | 15 |
| `eta.spread_z` | number | Spread factor for the ETA range | 0.84 |
| `ticket.max_active_per_patient_category_day` | int | | 1 |
| `ticket.show_doctor_when_called` | bool | | true |
| `ticket.reschedule_warn_when_ahead_lte` | int | Warn before reschedule if this close to turn | 2 |
| `closure.min_open_segment_minutes` | int | Shorter open segments count as closed | 15 |
| `closure.last_call_buffer_minutes` | int | No new service starts this close to a closure | 0 |
| `closure.long_confirm_days` | int | Extra confirmation above this length | 14 |
| `notify.channel` | string | Delivery channel (use existing infrastructure if present) | detect |
| `feature.queue_engine` | enum | `off`, `shadow`, `on` | `off` |
| `feature.legacy_compat` | bool | Legacy endpoints active | true |

Ticket code format comes from data too: a prefix column on category and on session, plus a format template setting.

## 4.5 Target data model (reference, adapt to the detected engine and naming conventions)

Reuse existing tables wherever they fit. Rename nothing in Phases 2 to 5.

```sql
-- Catalogs (replace hard-coded enums and CHECK constraints)
service_category (id, code, label_key, code_prefix, sort_order, active)
session_def      (id, code, label_key, code_prefix, sort_order, active)
session_schedule (session_id, dow, starts_at TIME, ends_at TIME)      -- weekly times, owned by the clinic

-- Roster: owned by the clinic, not by doctors
doctor_assignment (doctor_id, category_id, session_id, dow NULL, preferred_room_id NULL, active)
shift_exception   (id, doctor_id, service_date, session_id NULL, type /* leave|extra */, note)

-- Rooms: reuse existing table. Needs category reference and active flag.

-- Openings and closures (intervals are half-open [start, end))
extra_opening  (id, category_id NULL, period)
clinic_closure (id, scope /* clinic|category|doctor|room */, category_id, doctor_id, room_id,
                period, input_kind /* day|session|range, display only */,
                last_call_buffer_min NULL, reason, created_by, created_at, cancelled_at)

-- Queue
queue_counter (service_date, category_id, session_id, last_no, PRIMARY KEY (service_date, category_id, session_id))
queue_ticket  (id, patient_id, category_id, service_date, session_id, queue_no,
               source /* online|walk_in */, priority, status,
               checked_in_at, called_at, projected_start, projected_end,
               actual_start, actual_end, doctor_id NULL, room_id NULL,
               carried_over, moved_to NULL, expired_at, auto_closed, legacy_ref NULL, created_at)

-- History and decoupling
ticket_event        (id, ticket_id, event, from_status, to_status, actor, at, payload)
notification_outbox (id, ticket_id, kind, payload, status, created_at, sent_at)   -- only if no notification infra exists

-- Config
clinic_setting (key, scope_type, scope_id, value, updated_at)
```

Required constraints:

```sql
UNIQUE (service_date, category_id, session_id, queue_no)            -- on queue_ticket
UNIQUE (room_id)               WHERE status IN ('called','in_service')   -- one active patient per room
UNIQUE (patient_id, category_id, service_date)
                               WHERE status IN ('waiting','called','in_service')
CHECK (period is non-empty, lower-inclusive, upper-exclusive)        -- on closure tables
```

`duration_stats` is a **derived view** (not a source of truth), computed from actual start and end times of `done` tickets within the configured window.

If the engine lacks partial unique indexes or range types, propose the closest equivalent and flag it.

## 4.6 State machine (single source: one module)

```
waiting ──► called ──► in_service ──► done
   │           └──► no_show
   ├──► cancelled
   ├──► expired
   └──► moved
```

- Transitions happen only through explicit engine functions. No other code writes `status`.
- "Patient A has been served" means `status = done`. `actual_end` is a record of that action, never an input to ordering.
- Calling the next ticket in a room implicitly closes any previous `in_service` ticket in that room (`auto_closed = true`).

---

# 5. MASTER ALGORITHMS (reference behavior, implement as pure functions)

Notation: `ctx` carries config and repositories. All durations and thresholds are read from config.

## 5.1 Calendar

```text
effectiveOpenSegments(category, date):
  base    = session_schedule for dow(date)
  extra   = extra_opening(category, date)
  closed  = union( applicable closures for category on date, not cancelled )   # scope clinic or this category
  for session in base + extra:
    segs = subtract(session.interval, closed)
    segs = drop segments shorter than closure.min_open_segment_minutes
  return segs by session

isOpen(category, t)   = t inside a segment AND lanes(category, t) > 0
nextOpen(category, t) = start of the nearest segment >= t (t itself if open)
```

- Closure always beats extra opening. To open during a closure, shorten or cancel the closure.
- Doctor and room closures do not change open hours. They reduce `lanes`. If lanes is 0, treat the category as closed.

## 5.2 Duration estimate

```text
mean = trimmed mean of (actual_end - actual_start) over `duration.window_days`,
       only done tickets, only durations within [valid_min, valid_max]
estimate = (n * mean + prior_weight * prior_minutes) / (n + prior_weight)
segment fallback: service type -> category -> global prior, using a segment only if n >= min_samples
```

## 5.3 Simulation, ETA, and "fits"

```text
latestStart(segment) = min( segment.end + overflow_tolerance,
                            nextClosureStart(segment.end) - last_call_buffer )

simulate(queue ordered by [priority DESC, carried_over DESC, session_order, queue_no]):
  heap = MinHeap( nextOpen(cat, max(now, lane.start)) for each lane )
  for ticket in queue:
    free  = heap.pop()
    start = nextOpen(cat, free)
    seg   = segment containing start
    fits  = seg exists AND start <= latestStart(seg)
    if ticket.status == in_service:
      end = now + max(estimate - elapsed, duration.min_remaining_minutes)
    else:
      end = start + estimate                      # may cross the next closure start
    result[ticket] = { start, fits }
    heap.push(end)

displayRange = ETA ± eta.spread_z * sd * sqrt(aheadPerLane), rounded to eta.display_round_minutes
```

Redisplay and notify according to `eta.update_threshold_minutes` and `eta.notify_delay_minutes`. The **number never changes**. Only the estimate moves.

## 5.4 Issue ticket

```text
issueTicket(patient, category, date, preference):
  validate hard rules (section 7.1)
  for day in [date .. date + queue.search_horizon_days]:
    for session in orderedSessions(day, preference):       # "soonest" = by time
      segs = effectiveOpenSegments(category, day)[session]
      if segs empty: continue
      sim = simulate(current queue + candidate)
      if candidate fits: return save(ticket)               # atomic number, see below
  return handOverToAdmin()                                 # practically never reached
```

Atomic numbering:

```sql
INSERT INTO queue_counter (service_date, category_id, session_id, last_no) VALUES ($1,$2,$3,1)
ON CONFLICT (service_date, category_id, session_id)
DO UPDATE SET last_no = queue_counter.last_no + 1
RETURNING last_no;
```

Ticket creation does **not** set `room_id` or `doctor_id`.

## 5.5 Call next (this is where room and doctor are assigned)

```text
callNext(room):
  doctor = doctor on duty for this room
  BEGIN
    ticket = SELECT ... FROM queue_ticket
             WHERE status='waiting' AND service_date=today AND category=room.category
               AND session_order <= currentSession.order AND isOpen(room.category, now)
             ORDER BY priority DESC, carried_over DESC, session_order, queue_no
             FOR UPDATE SKIP LOCKED LIMIT 1
    UPDATE ticket SET status='called', room_id=room.id, doctor_id=doctor.id, called_at=now()
  COMMIT     # fails if the room still has an active ticket (unique index)
  enqueue notification; recompute estimates
```

If the clinic is closed at `now`, `callNext` is **refused** with a clear message. There is no force flag.

## 5.6 Apply closure (preview and commit use the same function)

```text
applyClosure(closure, commit):
  for each affected (day, category, session):
    queue = waiting tickets in order
    sim   = simulate(queue) using open segments that include this closure
    for t in queue:
      if sim[t].fits:
        if sim[t].start != t.projected_start: shifted += t else unchanged += t
      elif t.checked_in_at is not null: needsAdminDecision += t
      else: toMove += t
  if not commit: return report
  BEGIN
    save closure
    for t in toMove (ordered): new = issueTicket(patient, category, search from end of t.session,
                                                  preference=soonest, carried_over=true)
                               t.status='moved'; t.moved_to=new.id; enqueue notification
    update estimates for shifted; write ticket_event audit rows
  COMMIT
```

Plus an idempotent **sweep job** that re-checks all waiting tickets against current closures and applies the same decision table.

## 5.7 Reschedule

```text
reschedule(ticket, newChoice):
  refuse unless status='waiting' AND checked_in_at is null
  warn if peopleAhead <= ticket.reschedule_warn_when_ahead_lte
  BEGIN
    old.status = 'moved'            # first, so the one-active-ticket rule passes
    new = issueTicket(patient, newChoice)
    old.moved_to = new.id
  COMMIT
```

There is no slot to collide with, so reschedule needs no conflict check.

---

# 6. LEGACY COMPATIBILITY STRATEGY

## 6.1 Classify every legacy endpoint (Phase 1 output)

| Class | Meaning | Handling |
|---|---|---|
| **A** | Fully expressible on the new engine | Adapter returns the exact legacy shape |
| **B** | Expressible with degraded fields | Adapter returns the legacy shape; fields that no longer exist are `null`, derived, or neutral. Document each. |
| **C** | Cannot be preserved honestly | Keep the legacy path alive behind a flag, mark for frontend change, schedule removal |

Example for class B: a legacy availability endpoint that returns per-session `disabled` flags and slot counts. The adapter returns every session as enabled, derives any numeric field from the soft capacity or leaves it null, and may add new optional fields (for example a load label). This alone removes the patient-loss problem even before the frontend changes. Treat this as an example: decide from what you actually find.

## 6.2 Implementation preference order

1. Backend service-layer adapter (code).
2. Database **view** with the legacy name and columns for **reads**.
3. One-way **projection job or trigger** only when 1 and 2 are not enough.

Writes from legacy endpoints are translated into new-engine calls. Do not write directly into legacy tables from new code except through the projection.

## 6.3 Guardrails

- Legacy endpoints get **contract tests** built from the golden samples captured in Phase 0.
- Add deprecation headers and **usage logging** to legacy endpoints so removal can be decided from evidence.
- Everything is switched by `feature.queue_engine` (`off`, `shadow`, `on`) and `feature.legacy_compat`.
- `shadow` mode: compute new-engine tickets and estimates alongside the legacy flow without affecting patients. Log the differences.

---

# 7. BUSINESS RULES CATALOG

## 7.1 Hard rules (the system enforces)

| ID | Rule |
|---|---|
| H1 | No ticket is created for a time when the clinic is closed. The patient is **redirected** to the nearest open session or day. |
| H2 | At most `ticket.max_active_per_patient_category_day` active tickets per patient, category, and day. |
| H3 | One room serves one patient at a time. |
| H4 | Ticket numbers never change and are never reused. |
| H5 | No reschedule after check-in or call. Only admin may act after that. |
| H6 | No new call is started inside a closure interval. |
| H7 | Tickets are never deleted. |

Everything else (capacity, doctor choice, room choice, doctor count) is **soft**: the system adapts and recomputes.

## 7.2 Capacity and roster

- Clinic-owned `session_schedule` and `doctor_assignment`. A newly added doctor is on duty by default unless an exception exists. Doctors do not create schedules.
- `lanes = min(doctors on duty in category, rooms in category)`, minus doctor and room closures.
- If doctors exceed rooms, show the admin a suggestion. Do not block anyone.
- Room assignment mode: **pool** (any free room in the category) with optional `preferred_room_id`.

## 7.3 Closure rules

| ID | Rule |
|---|---|
| C1 | Closures are half-open intervals in the clinic timezone, `end > start`. |
| C2 | Day, session, and range inputs normalize to an interval before saving. Session closures copy the session times at creation. |
| C3 | Start must not be in the past, except "close now" which starts at `now`. End is always required. Length above `closure.long_confirm_days` needs an extra confirmation. |
| C4 | Default scope is the whole clinic. Category, doctor, and room scopes are explicit. |
| C5 | Overlapping or adjacent closures are merged for computation. Duplicates have no double effect. |
| C6 | Closure beats extra opening and base schedule. |
| C7 | Open segments shorter than `closure.min_open_segment_minutes` count as closed. |
| C8 | Services already `called` or `in_service` continue, even past the closure start. |
| C9 | New service may start only before `closure start - last_call_buffer`. |
| C10 | Affected tickets are judged by **simulation**, not by overlap alone. A checked-in patient who still fits is unaffected. |
| C11 | Tickets that fit keep their number and session, and only the estimate shifts. Tickets that do not fit are moved with `carried_over = true`. |
| C12 | Checked-in tickets that no longer fit go to **needs admin decision**. They are never moved automatically. |
| C13 | Moved tickets keep relative order and are valid immediately. The patient is notified and may cancel. No confirmation is required. |
| C14 | Cancelling or shortening a closure affects new registrations and estimates only. Already moved tickets **stay** moved. |
| C15 | Extending a closure re-applies the decision table only to newly affected tickets. |
| C16 | A preview is mandatory when any ticket is affected, and commit must produce exactly what the preview showed. |
| C17 | Every closure, cancellation, and move is audited (`ticket_event`). |

## 7.4 Ordering

Call order is `priority DESC, carried_over DESC, session_order ASC, queue_no ASC`. A no-show is skipped and may be re-inserted by admin before the session ends.

---

# 8. INVARIANTS AND ACCEPTANCE SCENARIOS

## 8.1 Invariants (turn into automated tests)

- `isOpen` and `nextOpen` are pure functions of (schedule, extra openings, closures, timezone).
- Applying the same closure twice yields the same state (idempotent).
- Preview equals commit.
- After the sweep, no waiting ticket has a projected start inside a closed interval.
- Ticket conservation: every affected ticket ends as unchanged, shifted, moved, or needs-decision. Row counts never shrink.
- `callNext` during a closure is refused.
- A closure for 8 to 10 (inclusive) covers `[8 00:00, 11 00:00)` and does **not** cover 11 at 00:00.
- The patient view never contains doctor, room, projected end, or capacity before the call.
- Changing a config value takes effect **without a deploy**.
- No literal category, session, label, or threshold exists in domain code (a lint or grep check).

## 8.2 Scenarios

Assume Monday to Saturday open. Sessions: morning 06:00 to 12:00, afternoon 12:00 to 17:00, evening 17:00 to 21:00. Sunday has no sessions. Tolerance 30 minutes, last call buffer 0.

| # | Action | Expected |
|---|---|---|
| S1 | Close all of Saturday the 10th. Three waiting morning tickets, none checked in. | All three moved to Monday the 12th morning (Sunday has no sessions), `carried_over`, same relative order, patients notified |
| S2 | Close the afternoon session on Friday the 9th | Morning tickets untouched. Afternoon tickets moved to the evening session the same day |
| S3 | Close 13:00 to 14:00 on Friday the 9th. One patient started 12:50. One waiting ticket estimated 13:20. | The 12:50 patient finishes. The 13:20 ticket shifts to 14:00 or later. Number unchanged |
| S4 | Close now (15:00) to end of day. One `in_service`, one `called`, two waiting not checked in, one waiting checked in. | `in_service` and `called` continue. Two unchecked tickets moved to next open day. Checked-in ticket goes to needs admin decision |
| S5 | Close from 18:00 to end of day. Evening session 17:00 to 21:00. | Open segment 17:00 to 18:00 remains. Tickets estimated after 18:00 are moved. Earlier ones stay |
| S6 | Close 12:00 to 16:50 | Only 10 minutes remain in the afternoon session, so the whole session counts as closed and its tickets are moved |
| S7 | Cancel the S1 closure | Moved tickets stay on Monday. New registrations for Saturday are accepted again |
| S8 | Close the 8th to 10th, then the 10th to 11th | Treated as one merged closure. No ticket is moved twice |
| S9 | Close doctor A only, Wednesday 07:00 to 12:00 (two general doctors, two general rooms) | Lanes drop from 2 to 1. Open hours unchanged. Estimates grow. Newest tickets redirect if load exceeds the configured ratio |
| S10 | Two registrations at the same instant for the same (date, category, session) | Distinct consecutive numbers, no duplicates |
| S11 | Two staff call the next ticket at once | Each gets a different ticket (`SKIP LOCKED`), or one is refused if the room is occupied |
| S12 | Legacy endpoint called with a recorded golden request | Response matches the recorded shape (classes A and B) |

---

# 9. PHASES: WHAT TO DO AND WHAT TO DELIVER

## Phase 1: Gap analysis and plan (read-only)

Using the approved Discovery Report, produce:

1. **Gap analysis table**: each target concept (section 4) against what exists. Columns: target concept, existing artifact (with evidence), action (`reuse`, `extend`, `add`, `derive`, `deprecate`), risk, compatibility class.
2. **What must be migrated** (data), **what must be fixed** (broken or contradictory structures, hard-coded values, data quality), and **what must be added**.
3. **Endpoint classification** (A, B, C) for every legacy endpoint, with the adapter approach.
4. **Backend change list** and **frontend change list** (see Phases 4 and 5), ordered by value.
5. **Migration plan**: ordered list of migration files with the purpose, pre-checks, post-checks, and rollback of each.
6. **Backfill plan**: how legacy appointments map to tickets (`legacy_ref`), which history is migrated (for duration statistics), reconciliation queries. Because the data is seed data, also state whether a clean **reset and re-seed** through the new model is simpler than a backfill, and recommend one.
7. **Risk register** and rollback plan.
8. **Batched questions** with proposed defaults (including the seeded config values in 4.4).

Then **STOP**.

## Phase 2: Expand (additive only)

Suggested order (adjust to findings, one concern per file):

1. `clinic_setting` plus seed of all keys in 4.4.
2. `service_category`, `session_def`, `session_schedule`, seeded from the **distinct values actually found** in legacy data (do not seed from this prompt's examples).
3. Roster tables (`doctor_assignment`, `shift_exception`), seeded from the existing doctor-category-session relationships. Default: on duty.
4. `extra_opening`, `clinic_closure`.
5. `queue_counter`, `queue_ticket`, `ticket_event`, and the outbox (if needed).
6. **Backfill** (idempotent via `legacy_ref`). **Optional**, because the data is seed data: if a reset and re-seed through the new model is simpler, do that and say so. Whichever path you choose, produce a reconciliation report: counts by category and status, legacy versus new, mismatches.
7. Constraints and unique indexes, **after** the backfill passes reconciliation.

Deliverables: migration files (up and down), pre and post checks, reconciliation report. Then **STOP**.

## Phase 3: Compatibility layer

Implement adapters per the classification in section 6. Add contract tests from the golden samples, deprecation headers, usage logging, and the feature flags. Deliverables: adapters, contract tests (all passing), a table listing every degraded field of every class B endpoint. Then **STOP**.

## Phase 4: Backend

- Module layout mirroring 4.3. Pure domain core with no framework imports.
- Repositories for I/O. Config service with caching and validation (missing key fails loudly).
- New endpoints (adapt names and auth to existing conventions):

| Purpose | Endpoint (suggested) |
|---|---|
| Catalog for the wizard (categories, sessions, labels), so the frontend hard-codes nothing | `GET /v2/catalog` |
| Issue ticket | `POST /v2/tickets` |
| Patient ticket view | `GET /v2/tickets/{id}` |
| Reschedule, cancel, check-in | `POST /v2/tickets/{id}/reschedule`, `/cancel`, `/check-in` |
| Admin queue board | `GET /v2/admin/queue?date&category` |
| Call next, start, finish, no-show | `POST /v2/admin/rooms/{id}/call-next`, `/v2/admin/tickets/{id}/start`, `/finish`, `/no-show` |
| Closure preview and commit | `POST /v2/admin/closures/preview`, `POST /v2/admin/closures`, `PATCH` and `DELETE` on a closure |
| Roster | `GET` and `PUT /v2/admin/roster` |
| Settings | `GET` and `PUT /v2/admin/settings` |

- Jobs: sweep, expire at session end (soft) and day end, statistics refresh, notification delivery.
- Generate an **OpenAPI spec and TypeScript types** from the backend. The frontend consumes these. It does not invent its own types.
- Tests: unit tests for every pure function, the scenarios S1 to S12, concurrency tests, and the invariants in 8.1.

Then **STOP**.

## Phase 5: Frontend

Produce a **Frontend Change Spec** first (and implement only if asked):

**Must change**

- Patient wizard becomes: service, day, time preference (default "soonest"), confirm. Remove the doctor choice, room choice, total slot display, and disabled session cells. Categories and sessions come from `GET /v2/catalog`.
- Patient ticket screen consumes only the patient view: code, people ahead, ETA range, status, and (when called) room.
- Dates that are closed show a label, stay selectable, and lead to the redirect message.
- Reschedule reopens the wizard prefilled. Cancel is one action.
- Admin: queue board, call-next from a room, check-in, start and finish, and a closure form with 24-hour input, a **summary sentence**, a mandatory preview, and apply.

**Must not do**

- No hard-coded categories, sessions, labels, thresholds, or durations. No business logic. No fields the patient view does not provide.

**Can stay unchanged for now** (thanks to the compat layer): list every screen and endpoint that works as is, with the class of its adapter.

Provide the rollout order and a removal list (frontend code that becomes dead once the new flow ships). Then **STOP**.

## Phase 6: Verify, roll out, contract

1. Run shadow mode (`feature.queue_engine = shadow`) and compare. Report differences.
2. Staged switch to `on`, with a documented rollback (flag back, no data loss).
3. Monitor legacy endpoint usage. When usage is zero for the agreed period and the human approves, produce the **contract migrations** (remove legacy columns, views, and adapters) with `down` scripts. Legacy **data** may be deleted freely because it is seed data. Legacy **schema objects** are removed only under the rules above (explicit approval and zero usage).
4. Final report: what changed, what was removed, open issues.

---

# 10. FIRST ACTION

Begin **Phase 0** now.

1. State which environment you are connected to and confirm read-only access.
2. Run the discovery described in section 3.
3. Deliver the Discovery Report in the exact structure of 3.5.
4. **Do not write, alter, or design anything yet.** Wait for `APPROVE PHASE 1`.

# END PROMPT
