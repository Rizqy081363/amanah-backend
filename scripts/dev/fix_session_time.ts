import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://amanah:amanah_secret@127.0.0.1:5433/amanah_healthcare'
});

async function main() {
  try {
    const res = await pool.query(`
      UPDATE practitioner_schedule_sessions
      SET end_time = '02:30:00', capacity = 1, available_slots = 1
      WHERE id = '85cadfaa-89f1-4123-8dd3-51982d626661'
      RETURNING id, start_time, end_time, capacity, available_slots;
    `);
    console.log('Fixed session 85cadfaa:', res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
