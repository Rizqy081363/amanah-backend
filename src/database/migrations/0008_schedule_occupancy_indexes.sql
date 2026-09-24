CREATE INDEX IF NOT EXISTS practitioner_schedule_sessions_date_room_idx 
ON practitioner_schedule_sessions (schedule_date, room_id, status);

CREATE INDEX IF NOT EXISTS practitioner_schedule_sessions_date_time_idx 
ON practitioner_schedule_sessions (schedule_date, start_time, end_time);
