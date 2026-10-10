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

    console.log('--- ALL DOCTOR ASSIGNMENTS ---');
    const sessions = await pool.query(
      `SELECT da.id, da.doctor_id, da.dow, sd.code as session_code, sd.default_starts_at, sd.default_ends_at, da.preferred_room_id, cr.name as room_name, da.is_active, sp.full_name
       FROM doctor_assignment da
       JOIN session_def sd ON da.session_id = sd.id
       JOIN practitioners p ON da.doctor_id = p.id
       JOIN staff_profiles sp ON p.staff_profile_id = sp.id
       LEFT JOIN clinic_rooms cr ON da.preferred_room_id = cr.id
       ORDER BY da.dow, sd.sort_order`
    );
    console.log(sessions.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
