import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://amanah:amanah_secret@127.0.0.1:5433/amanah_healthcare'
});

async function main() {
  try {
    console.log('--- ALL USERS ---');
    const users = await pool.query(
      `SELECT id, name, email FROM users`
    );
    console.log(users.rows);

    console.log('--- PRACTITIONERS ---');
    const prs = await pool.query(
      `SELECT p.id as practitioner_id, p.staff_profile_id, sp.full_name, sp.user_id, u.email, p.consultation_duration_minutes
       FROM practitioners p
       JOIN staff_profiles sp ON p.staff_profile_id = sp.id
       JOIN users u ON sp.user_id = u.id`
    );
    console.log(prs.rows);

    console.log('--- ALL SCHEDULE SESSIONS ---');
    const sessions = await pool.query(
      `SELECT s.id, s.practitioner_id, s.schedule_date, s.start_time, s.end_time, s.room_id, cr.name as room_name, s.status, s.notes, sp.full_name
       FROM practitioner_schedule_sessions s
       JOIN practitioners p ON s.practitioner_id = p.id
       JOIN staff_profiles sp ON p.staff_profile_id = sp.id
       LEFT JOIN clinic_rooms cr ON s.room_id = cr.id
       ORDER BY s.schedule_date, s.start_time`
    );
    console.log(sessions.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
