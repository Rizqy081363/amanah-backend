import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://amanah:amanah_secret@127.0.0.1:5433/amanah_healthcare'
});

async function main() {
  try {
    // 1. Better Auth "user" table — fadhiilah
    const baUser = await pool.query(
      `SELECT id, name, email, image FROM "user" WHERE email = 'zikridokter@gmail.com'`
    );
    console.log('=== Better Auth "user" table ===');
    console.log(JSON.stringify(baUser.rows, null, 2));

    // 2. Canonical "users" table — fadhiilah
    const coreUser = await pool.query(
      `SELECT id, name, email, image_url FROM users WHERE email = 'zikridokter@gmail.com'`
    );
    console.log('\n=== Canonical "users" table ===');
    console.log(JSON.stringify(coreUser.rows, null, 2));

    // 3. staff_profiles — fadhiilah
    const staff = await pool.query(
      `SELECT id, user_id, full_name, avatar_url FROM staff_profiles WHERE user_id = '187b7e82-cf55-4858-854c-bc8ff1e2b5b2'`
    );
    console.log('\n=== staff_profiles ===');
    console.log(JSON.stringify(staff.rows, null, 2));

    // 4. Check if trigger exists
    const triggers = await pool.query(
      `SELECT tgname, tgrelid::regclass, tgenabled FROM pg_trigger WHERE tgname LIKE '%avatar%' OR tgname LIKE '%image%'`
    );
    console.log('\n=== Triggers ===');
    console.log(JSON.stringify(triggers.rows, null, 2));

    // 5. Check ALL staff_profiles avatar_url vs their user image_url
    const comparison = await pool.query(`
      SELECT 
        sp.full_name,
        sp.avatar_url as staff_avatar,
        u.image_url as users_image_url,
        ba.image as betterauth_image
      FROM staff_profiles sp
      LEFT JOIN users u ON sp.user_id = u.id
      LEFT JOIN "user" ba ON sp.user_id = ba.id
    `);
    console.log('\n=== Avatar comparison across all tables ===');
    for (const row of comparison.rows) {
      console.log(`  ${row.full_name}:`);
      console.log(`    staff_profiles.avatar_url: ${row.staff_avatar || '(null)'}`);
      console.log(`    users.image_url:           ${row.users_image_url || '(null)'}`);
      console.log(`    user.image (BetterAuth):   ${row.betterauth_image || '(null)'}`);
    }

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

main();
