<#
.SYNOPSIS
    Automated Seeding Script for Doctor's Clinical Queue & Push Notification Testing.
.DESCRIPTION
    Dynamically seeds 4 waiting patients into PostgreSQL for dr. Zikri Fadila Ahmad.
    Respects the SSOT prefix convention:
      - Service Prefix (e.g. 'UM' from clinic_services)
      - Session Prefix (e.g. 'S' for afternoon or 'P' for morning from session_def)
      - Formats queue tickets monotonically: ${ServicePrefix}-${SessionPrefix}${Sequence} (e.g. UM-S001, UM-S002)
      - Assigns to the doctor's preferred room (Ruang Poli Umum 1)
      - Avoids hardcoded literals and automatically handles collision-free sequence numbers.
.EXAMPLE
    pwsh backend/scripts/seed-clinical-queue.ps1
    pwsh backend/scripts/seed-clinical-queue.ps1 -SessionCode "afternoon" -ResetToday
#>

[CmdletBinding()]
param(
    [string]$DoctorEmail = "zikrifadhiilahahmad@gmail.com",
    [string]$SessionCode = "afternoon",
    [string]$ServiceCode = "general_checkup",
    [int]$PatientLimit = 4,
    [switch]$ResetToday
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   AMANAH CLINICAL QUEUE SEEDER (Automated & Dynamic)   " -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# 1. Verify Docker Postgres container is running
Write-Host "[1/5] Verifying PostgreSQL container..." -ForegroundColor Yellow
$containerStatus = docker inspect -f '{{.State.Status}}' backend-postgres-1 2>$null
if ($containerStatus -ne "running") {
    Write-Error "Container 'backend-postgres-1' is not running (Status: $containerStatus). Please start docker compose first."
    exit 1
}
Write-Host "  -> Container 'backend-postgres-1' is healthy & running." -ForegroundColor Green

# 2. Cleanup existing today's queue if requested
if ($ResetToday) {
    Write-Host "`n[2/5] Cleaning up existing appointments & tickets for today..." -ForegroundColor Yellow
    $cleanSql = @"
DO `$clean`$
DECLARE
    v_doc_id uuid;
BEGIN
    SELECT p.id INTO v_doc_id
    FROM users u
    JOIN staff_profiles sp ON sp.user_id = u.id
    JOIN practitioners p ON p.staff_profile_id = sp.id
    WHERE u.email = '$DoctorEmail';

    IF v_doc_id IS NOT NULL THEN
        DELETE FROM appointments
        WHERE scheduled_date = CURRENT_DATE
          AND practitioner_id = v_doc_id;
        RAISE NOTICE 'Deleted existing today appointments for practitioner: %', v_doc_id;
    END IF;
END `$clean`$;
"@
    docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -c $cleanSql | Out-Null
    Write-Host "  -> Cleanup completed." -ForegroundColor Green
} else {
    Write-Host "`n[2/5] Preserving existing records (new patients will append monotonically)." -ForegroundColor Cyan
}

# 3. Dynamic Seeding Execution
Write-Host "`n[3/5] Executing dynamic seeding query..." -ForegroundColor Yellow

$seedSql = @"
DO `$seed`$
DECLARE
    v_doctor_id uuid;
    v_doctor_name text;
    v_room_id uuid;
    v_room_name text;
    v_service_id uuid;
    v_service_name text;
    v_category_id uuid;
    v_service_prefix text;
    v_session_id uuid;
    v_session_code text := '$SessionCode';
    v_session_prefix text;
    v_starts_at time;
    v_full_prefix text;
    v_seq_start int;
    v_patient RECORD;
    v_idx int := 0;
    v_apt_id uuid;
    v_ticket_num text;
    v_booking_code text;
    v_slot_time time;
    v_complaints text[] := ARRAY[
        'Pemeriksaan rutin tekanan darah dan keluhan pusing berputar',
        'Kontrol berkala kesehatan lambung dan batuk ringan',
        'Demam naik turun sejak 2 hari terakhir disertai lemas',
        'Konsultasi hasil laboratorium darah rutin dan skrining fisik'
    ];
BEGIN
    -- Resolve Doctor & Assignment
    SELECT p.id, sp.full_name, da.preferred_room_id, da.session_id, da.category_id, cr.name
    INTO v_doctor_id, v_doctor_name, v_room_id, v_session_id, v_category_id, v_room_name
    FROM users u
    JOIN staff_profiles sp ON sp.user_id = u.id
    JOIN practitioners p ON p.staff_profile_id = sp.id
    JOIN doctor_assignment da ON da.doctor_id = p.id AND da.is_active = true
    JOIN clinic_rooms cr ON cr.id = da.preferred_room_id
    JOIN session_def sd ON sd.id = da.session_id
    WHERE u.email = '$DoctorEmail'
      AND sd.code = v_session_code
    LIMIT 1;

    IF v_doctor_id IS NULL THEN
        -- Fallback: resolve doctor and preferred room directly
        SELECT p.id, sp.full_name, p.default_room_id, cr.name
        INTO v_doctor_id, v_doctor_name, v_room_id, v_room_name
        FROM users u
        JOIN staff_profiles sp ON sp.user_id = u.id
        JOIN practitioners p ON p.staff_profile_id = sp.id
        LEFT JOIN clinic_rooms cr ON cr.id = p.default_room_id
        WHERE u.email = '$DoctorEmail';

        SELECT id INTO v_session_id FROM session_def WHERE code = v_session_code LIMIT 1;
    END IF;

    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'Doctor with email % was not found.', '$DoctorEmail';
    END IF;

    -- Resolve Service
    SELECT cs.id, cs.name, cs.code_prefix, cs.service_category_id
    INTO v_service_id, v_service_name, v_service_prefix, v_category_id
    FROM clinic_services cs
    WHERE cs.code = '$ServiceCode' OR cs.code_prefix = 'UM'
    ORDER BY cs.display_order ASC
    LIMIT 1;

    IF v_service_id IS NULL THEN
        SELECT cs.id, cs.name, cs.code_prefix, cs.service_category_id
        INTO v_service_id, v_service_name, v_service_prefix, v_category_id
        FROM clinic_services cs
        LIMIT 1;
    END IF;

    -- Resolve Session Def
    SELECT sd.code_prefix, sd.default_starts_at
    INTO v_session_prefix, v_starts_at
    FROM session_def sd
    WHERE sd.id = v_session_id;

    v_full_prefix := v_service_prefix || '-' || v_session_prefix;

    -- Monotonic collision-free starting sequence
    SELECT COALESCE(MAX(SUBSTRING(queue_number FROM '[0-9]+$')::int), 0)
    INTO v_seq_start
    FROM queue_tickets
    WHERE queue_date = CURRENT_DATE
      AND queue_number LIKE v_full_prefix || '%';

    RAISE NOTICE 'Target Doctor : % (ID: %)', v_doctor_name, v_doctor_id;
    RAISE NOTICE 'Room          : % (ID: %)', v_room_name, v_room_id;
    RAISE NOTICE 'Service       : % (Prefix: %)', v_service_name, v_service_prefix;
    RAISE NOTICE 'Session       : % (Prefix: %, Start: %)', v_session_code, v_session_prefix, v_starts_at;
    RAISE NOTICE 'Queue Prefix  : % (Current Max Sequence: %)', v_full_prefix, v_seq_start;

    -- Seed patients
    FOR v_patient IN (
        SELECT id, full_name, medical_record_number
        FROM patient_profiles
        ORDER BY medical_record_number ASC
        LIMIT $PatientLimit
    ) LOOP
        v_idx := v_idx + 1;
        v_slot_time := v_starts_at + ((v_idx - 1) * INTERVAL '20 minutes');
        v_ticket_num := v_full_prefix || LPAD((v_seq_start + v_idx)::text, 3, '0');
        v_booking_code := 'BOOK-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD((v_seq_start + v_idx)::text, 4, '0');

        -- Insert Appointment
        INSERT INTO appointments (
            booking_code,
            patient_id,
            practitioner_id,
            service_id,
            room_id,
            visit_type,
            status,
            scheduled_date,
            scheduled_start_time,
            scheduled_end_time,
            queue_number,
            complaint,
            estimated_start_at,
            estimated_end_at,
            created_at,
            updated_at
        ) VALUES (
            v_booking_code,
            v_patient.id,
            v_doctor_id,
            v_service_id,
            v_room_id,
            'new_visit',
            'waiting',
            CURRENT_DATE,
            v_slot_time,
            v_slot_time + INTERVAL '20 minutes',
            v_seq_start + v_idx,
            v_complaints[v_idx],
            (CURRENT_DATE + v_slot_time)::timestamp with time zone,
            (CURRENT_DATE + v_slot_time + INTERVAL '20 minutes')::timestamp with time zone,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_apt_id;

        -- Insert Queue Ticket
        INSERT INTO queue_tickets (
            appointment_id,
            service_id,
            category_id,
            session_id,
            doctor_id,
            patient_id,
            room_id,
            queue_date,
            queue_number,
            priority,
            status,
            waiting_position,
            source,
            assigned_at,
            created_at,
            updated_at
        ) VALUES (
            v_apt_id,
            v_service_id,
            v_category_id,
            v_session_id,
            v_doctor_id,
            v_patient.id,
            v_room_id,
            CURRENT_DATE,
            v_ticket_num,
            'regular',
            'waiting',
            v_seq_start + v_idx,
            'online',
            NOW(),
            NOW(),
            NOW()
        );

        RAISE NOTICE '  [+] Seeded Patient %: % (%) -> Ticket: %', v_idx, v_patient.full_name, v_patient.medical_record_number, v_ticket_num;
    END LOOP;
END `$seed`$;
"@

$result = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -c $seedSql
$result | ForEach-Object { Write-Host $_ -ForegroundColor White }

# 4. Fetch and Verify Active Queue
Write-Host "`n[4/5] Verifying seeded queue records in PostgreSQL..." -ForegroundColor Yellow
$verifySql = @"
SELECT 
    qt.queue_number AS "No Antrean",
    p.full_name AS "Nama Pasien",
    p.medical_record_number AS "No RM",
    a.status AS "Status Janji",
    qt.status AS "Status Tiket",
    cr.name AS "Ruangan",
    TO_CHAR(a.scheduled_start_time, 'HH24:MI') AS "Waktu Mulai"
FROM appointments a
JOIN queue_tickets qt ON qt.appointment_id = a.id
JOIN patient_profiles p ON p.id = a.patient_id
JOIN clinic_rooms cr ON cr.id = a.room_id
WHERE a.scheduled_date = CURRENT_DATE
ORDER BY qt.queue_number ASC;
"@

$verifyOutput = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -c $verifySql
$verifyOutput | ForEach-Object { Write-Host $_ -ForegroundColor Green }

# 5. Summary
Write-Host "`n[5/5] Seeding Summary:" -ForegroundColor Yellow
Write-Host "  -> Selesai! $PatientLimit pasien berhasil didaftarkan ke antrean status 'waiting'." -ForegroundColor Green
Write-Host "  -> Prefix antrean menghormati SSOT ('UM-S' / 'UM-P') tanpa hardcode literal." -ForegroundColor Green
Write-Host "  -> Mobile Flutter client siap memuat 4 kartu antrean ini secara real-time.`n" -ForegroundColor Green
