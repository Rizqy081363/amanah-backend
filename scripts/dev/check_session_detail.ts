import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://amanah:amanah_secret@127.0.0.1:5433/amanah_healthcare'
});

async function main() {
  try {
    const res = await pool.query(
      `SELECT * FROM appointments LIMIT 10`
    );
    console.log('Sample appointments:', res.rows.length);

    const s = await pool.query(
      `SELECT * FROM session_def`
    );
    console.log('Session definitions:', s.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
