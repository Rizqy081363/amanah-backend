-- Migration: 0004_purge_user_systemic_function
-- Description: Creates the stored procedure purge_user_systemic for complete systemic user purging

CREATE OR REPLACE FUNCTION purge_user_systemic(p_target_input TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_patient_id UUID;
  v_staff_id UUID;
  v_practitioner_id UUID;
  v_result JSONB;
  v_is_uuid BOOLEAN := FALSE;
BEGIN
  -- Validate UUID format
  BEGIN
    IF p_target_input ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_is_uuid := TRUE;
      v_user_id := p_target_input::UUID;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_is_uuid := FALSE;
  END;

  -- 1. Locate User by UUID or Email in core 'users'
  IF v_is_uuid THEN
    SELECT id, email::text INTO v_user_id, v_email FROM users WHERE id = v_user_id;
  ELSE
    SELECT id, email::text INTO v_user_id, v_email FROM users WHERE lower(email::text) = lower(p_target_input);
  END IF;

  -- Fallback to "user" (Better Auth) if not found in core users
  IF v_user_id IS NULL THEN
    IF v_is_uuid THEN
      SELECT id, email INTO v_user_id, v_email FROM "user" WHERE id = p_target_input::UUID;
    ELSE
      SELECT id, email INTO v_user_id, v_email FROM "user" WHERE lower(email) = lower(p_target_input);
    END IF;
  END IF;

  -- If still null, check patient_profiles
  IF v_user_id IS NULL THEN
    IF v_is_uuid THEN
      SELECT id, user_id, email::text INTO v_patient_id, v_user_id, v_email 
      FROM patient_profiles 
      WHERE id = p_target_input::UUID;
    ELSE
      SELECT id, user_id, email::text INTO v_patient_id, v_user_id, v_email 
      FROM patient_profiles 
      WHERE lower(email::text) = lower(p_target_input);
    END IF;
  END IF;

  -- If neither user nor patient found, set email if input contains '@'
  IF v_email IS NULL AND p_target_input LIKE '%@%' THEN
    v_email := lower(p_target_input);
  END IF;

  IF v_user_id IS NULL AND v_email IS NULL AND v_patient_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'message', 'No user or patient profile found matching the input identifier: ' || p_target_input
    );
  END IF;

  -- 2. Locate linked Patient Profile if not already resolved
  IF v_patient_id IS NULL THEN
    IF v_user_id IS NOT NULL THEN
      SELECT id INTO v_patient_id FROM patient_profiles WHERE user_id = v_user_id;
    ELSIF v_email IS NOT NULL THEN
      SELECT id INTO v_patient_id FROM patient_profiles WHERE lower(email::text) = lower(v_email);
    END IF;
  END IF;

  -- 3. Locate linked Staff & Practitioner Profiles
  IF v_user_id IS NOT NULL THEN
    SELECT id INTO v_staff_id FROM staff_profiles WHERE user_id = v_user_id;
    IF v_staff_id IS NOT NULL THEN
      SELECT id INTO v_practitioner_id FROM practitioners WHERE staff_profile_id = v_staff_id;
    END IF;
  END IF;

  -- 4. Purge Patient Domain Records (reverse-dependency order)
  IF v_patient_id IS NOT NULL THEN
    DELETE FROM public_testimonials WHERE patient_id = v_patient_id;
    DELETE FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = v_patient_id);
    DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = v_patient_id);
    DELETE FROM medical_intake_submissions WHERE patient_id = v_patient_id;
    DELETE FROM clinical_encounters WHERE patient_id = v_patient_id;
    DELETE FROM appointments WHERE patient_id = v_patient_id;
    DELETE FROM patient_timeline_events WHERE patient_id = v_patient_id;
    DELETE FROM patient_emergency_contacts WHERE patient_id = v_patient_id;
    DELETE FROM patient_allergies WHERE patient_id = v_patient_id;
    DELETE FROM patient_addresses WHERE patient_id = v_patient_id;

    -- Patient Chat / Conversations
    DELETE FROM message_attachments WHERE message_id IN (
      SELECT id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE patient_id = v_patient_id)
    );
    DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE patient_id = v_patient_id);
    DELETE FROM conversation_participants WHERE conversation_id IN (SELECT id FROM conversations WHERE patient_id = v_patient_id);
    DELETE FROM conversations WHERE patient_id = v_patient_id;

    DELETE FROM patient_profiles WHERE id = v_patient_id;
  END IF;

  -- 5. Purge Staff & Practitioner Domain Records
  IF v_practitioner_id IS NOT NULL THEN
    DELETE FROM practitioner_schedule_sessions WHERE practitioner_id = v_practitioner_id;
    DELETE FROM practitioner_schedule_day_settings WHERE practitioner_id = v_practitioner_id;
    DELETE FROM practitioner_availability WHERE practitioner_id = v_practitioner_id;
    DELETE FROM practitioner_leave_periods WHERE practitioner_id = v_practitioner_id;
    UPDATE appointments SET practitioner_id = NULL WHERE practitioner_id = v_practitioner_id;
    UPDATE clinical_encounters SET practitioner_id = NULL WHERE practitioner_id = v_practitioner_id;
    UPDATE conversations SET assigned_practitioner_id = NULL WHERE assigned_practitioner_id = v_practitioner_id;
    UPDATE staff_leave_requests SET substitute_practitioner_id = NULL WHERE substitute_practitioner_id = v_practitioner_id;
    DELETE FROM practitioners WHERE id = v_practitioner_id;
  END IF;

  IF v_staff_id IS NOT NULL THEN
    DELETE FROM staff_leave_requests WHERE staff_profile_id = v_staff_id;
    DELETE FROM staff_attendance_records WHERE staff_profile_id = v_staff_id;
    DELETE FROM staff_credentials WHERE staff_profile_id = v_staff_id;
    DELETE FROM attendance_qr_sessions WHERE staff_profile_id = v_staff_id;
    UPDATE conversations SET assigned_staff_id = NULL WHERE assigned_staff_id = v_staff_id;
    UPDATE support_tickets SET assigned_staff_id = NULL WHERE assigned_staff_id = v_staff_id;
    DELETE FROM staff_profiles WHERE id = v_staff_id;
  END IF;

  -- 6. Purge Support Tickets and User-Sent Messages
  IF v_user_id IS NOT NULL THEN
    DELETE FROM support_ticket_attachments WHERE message_id IN (
      SELECT id FROM support_ticket_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE reporter_user_id = v_user_id)
    );
    DELETE FROM support_ticket_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE reporter_user_id = v_user_id);
    DELETE FROM support_tickets WHERE reporter_user_id = v_user_id;

    DELETE FROM support_ticket_attachments WHERE message_id IN (
      SELECT id FROM support_ticket_messages WHERE sender_user_id = v_user_id
    );
    DELETE FROM support_ticket_messages WHERE sender_user_id = v_user_id;

    DELETE FROM message_attachments WHERE message_id IN (
      SELECT id FROM messages WHERE sender_user_id = v_user_id
    );
    DELETE FROM messages WHERE sender_user_id = v_user_id;
    DELETE FROM conversation_participants WHERE user_id = v_user_id;

    DELETE FROM notification_recipients WHERE user_id = v_user_id;
    DELETE FROM notification_actions WHERE notification_id IN (SELECT id FROM notifications WHERE created_by = v_user_id);
    DELETE FROM notifications WHERE created_by = v_user_id;
    DELETE FROM user_data_export_jobs WHERE requested_by = v_user_id;
    DELETE FROM user_devices WHERE user_id = v_user_id;
    DELETE FROM audit_logs WHERE actor_user_id = v_user_id;

    UPDATE appointments SET created_by = NULL WHERE created_by = v_user_id;
    UPDATE appointments SET updated_by = NULL WHERE updated_by = v_user_id;
    UPDATE appointment_status_events SET changed_by = NULL WHERE changed_by = v_user_id;
    UPDATE clinical_encounters SET created_by = NULL WHERE created_by = v_user_id;
    UPDATE medical_intake_submissions SET submitted_by = NULL WHERE submitted_by = v_user_id;
    UPDATE patient_allergies SET recorded_by = NULL WHERE recorded_by = v_user_id;
    UPDATE staff_attendance_records SET recorded_by = NULL WHERE recorded_by = v_user_id;
    UPDATE staff_credentials SET verified_by = NULL WHERE verified_by = v_user_id;
    UPDATE staff_leave_requests SET reviewed_by = NULL WHERE reviewed_by = v_user_id;
    UPDATE attendance_qr_sessions SET created_by = NULL WHERE created_by = v_user_id;
    UPDATE practitioner_leave_periods SET created_by = NULL WHERE created_by = v_user_id;
    UPDATE practitioner_schedule_day_settings SET created_by = NULL WHERE created_by = v_user_id;
    UPDATE files SET uploaded_by = NULL WHERE uploaded_by = v_user_id;
  END IF;

  -- 7. Outbox Events
  IF v_user_id IS NOT NULL THEN
    DELETE FROM outbox_events WHERE aggregate_id = v_user_id::text OR payload->>'userId' = v_user_id::text;
  END IF;
  IF v_email IS NOT NULL THEN
    DELETE FROM outbox_events WHERE payload->>'email' = v_email;
  END IF;

  -- 8. Verifications
  IF v_email IS NOT NULL THEN
    DELETE FROM verification WHERE lower(identifier) = lower(v_email);
    DELETE FROM auth_verifications WHERE lower(identifier_hash) = lower(v_email);
  END IF;

  -- 9. Sessions & Accounts
  IF v_user_id IS NOT NULL THEN
    DELETE FROM session WHERE "userId" = v_user_id;
    DELETE FROM account WHERE "userId" = v_user_id;
    DELETE FROM auth_sessions WHERE user_id = v_user_id;
    DELETE FROM auth_two_factors WHERE user_id = v_user_id;
    DELETE FROM auth_accounts WHERE user_id = v_user_id;
    DELETE FROM user_roles WHERE user_id = v_user_id OR assigned_by = v_user_id;
  END IF;

  IF v_email IS NOT NULL THEN
    DELETE FROM auth_accounts WHERE lower(account_id) = lower(v_email);
  END IF;

  -- 10. Core User Records
  IF v_user_id IS NOT NULL THEN
    DELETE FROM users WHERE id = v_user_id;
    DELETE FROM "user" WHERE id = v_user_id;
  END IF;

  IF v_email IS NOT NULL THEN
    DELETE FROM users WHERE lower(email::text) = lower(v_email);
    DELETE FROM "user" WHERE lower(email) = lower(v_email);
  END IF;

  v_result := jsonb_build_object(
    'status', 'success',
    'input', p_target_input,
    'purged_user_id', v_user_id,
    'purged_email', v_email,
    'purged_patient_id', v_patient_id,
    'purged_staff_id', v_staff_id,
    'purged_practitioner_id', v_practitioner_id
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
