UPDATE practitioner_schedule_day_settings ds
SET leave_reason = 'Tutup', updated_at = NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM practitioner_schedule_sessions s
  WHERE s.practitioner_id = ds.practitioner_id
    AND s.schedule_date = ds.schedule_date
    AND s.status = 'open'
)
AND ds.is_leave = false
AND (ds.leave_reason = 'Buka' OR ds.leave_reason = 'open');
