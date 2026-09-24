import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://amanah:amanah_secret@127.0.0.1:5433/amanah_healthcare'
});

async function main() {
  try {
    const res = await pool.query(
      `SELECT * FROM appointments WHERE schedule_session_id = '85cadfaa-89f1-4123-8dd3-51982d626661'`
    );
    console.log('Appointments on session 85cadfaa-89f1-4123-8dd3-51982d626661:', res.rows.length);

    const s = await pool.query(
      `SELECT * FROM practitioner_schedule_sessions WHERE id = '85cadfaa-89f1-4123-8dd3-51982d626661'`
    );
    console.log('Session details:', s.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
