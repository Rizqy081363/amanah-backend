#!/usr/bin/env bun
import jwt from 'jsonwebtoken';
import {
  createDbPool,
  getEnvValue,
  dbHost,
  dbPort,
  dbName,
} from './purge/db-connection';

interface CliArgs {
  email?: string;
  expiresIn?: string;
  secret?: string;
  raw: boolean;
  list: boolean;
  help: boolean;
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    raw: false,
    list: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--raw' || arg === '-r') {
      result.raw = true;
    } else if (arg === '--list' || arg === '-l') {
      result.list = true;
    } else if (arg.startsWith('--email:')) {
      result.email = arg.substring('--email:'.length).trim();
    } else if (arg.startsWith('--email=')) {
      result.email = arg.substring('--email='.length).trim();
    } else if (arg === '--email' || arg === '-e') {
      result.email = args[++i]?.trim();
    } else if (arg.startsWith('--expires:')) {
      result.expiresIn = arg.substring('--expires:'.length).trim();
    } else if (arg.startsWith('--expires=')) {
      result.expiresIn = arg.substring('--expires='.length).trim();
    } else if (arg === '--expires' || arg === '-x') {
      result.expiresIn = args[++i]?.trim();
    } else if (arg.startsWith('--secret:')) {
      result.secret = arg.substring('--secret:'.length).trim();
    } else if (arg.startsWith('--secret=')) {
      result.secret = arg.substring('--secret='.length).trim();
    } else if (arg === '--secret' || arg === '-s') {
      result.secret = args[++i]?.trim();
    } else if (!arg.startsWith('-') && !result.email) {
      result.email = arg.trim();
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
Amanah Healthcare — Dynamic JWT Token Generator CLI

Usage:
  bun run db:jwt --email <email> [options]
  bun run db:jwt --email:<email> [options]
  bun ./scripts/dev/get-jwt-user.ts --email <email>

Options:
  --email, -e <email>      User email to generate JWT for (required unless --list)
  --expires, -x <time>     Token expiry (default: "7d" or AUTH_JWT_TOKEN_EXPIRES_IN)
  --secret, -s <secret>    JWT signing secret (default: AUTH_JWT_SECRET from .env, or "secret")
  --raw, -r                Print ONLY the JWT token string (ideal for scripting/pipe)
  --list, -l               List all available active users and their roles
  --help, -h               Show this help message

Examples:
  bun run db:jwt --email zikrifadhiilahahmad@gmail.com
  bun run db:jwt --email:admin@amanah.com
  bun run db:jwt --email:dokter@amanah.com --raw
  bun run db:jwt --list
`);
}

async function listUsers(pool: any): Promise<void> {
  const query = `
    SELECT 
      u.id, 
      u.email, 
      u.name, 
      r.name as role_name, 
      r.code as role_code,
      sp.position_title
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    LEFT JOIN staff_profiles sp ON u.id = sp.user_id
    ORDER BY u.created_at DESC
    LIMIT 50;
  `;

  const res = await pool.query(query);

  console.log('\n=== Available Users in Database ===\n');
  console.log(
    'Email'.padEnd(38) +
      'Role'.padEnd(16) +
      'Name'.padEnd(30) +
      'User ID',
  );
  console.log('-'.repeat(120));

  for (const row of res.rows) {
    const role = row.role_code || row.role_name || 'patient';
    console.log(
      (row.email || '(no email)').padEnd(38) +
        role.padEnd(16) +
        (row.name || '-').padEnd(30) +
        row.id,
    );
  }
  console.log(`\nTotal users displayed: ${res.rows.length}\n`);
}

async function main(): Promise<void> {
  const args = parseCliArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const pool = createDbPool();

  try {
    if (args.list) {
      await listUsers(pool);
      process.exit(0);
    }

    if (!args.email) {
      if (!args.raw) {
        console.error('[ERROR] Missing required --email parameter.');
        printUsage();
      }
      process.exit(1);
    }

    const query = `
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.phone,
        r.id as role_id, 
        r.code as role_code, 
        r.name as role_name,
        sp.id as staff_id,
        sp.position_title,
        sp.staff_code,
        doc.id as practitioner_id
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN staff_profiles sp ON u.id = sp.user_id
      LEFT JOIN practitioners doc ON sp.id = doc.staff_profile_id
      WHERE LOWER(u.email) = LOWER($1)
      LIMIT 1;
    `;

    const res = await pool.query(query, [args.email]);

    if (res.rows.length === 0) {
      if (args.raw) {
        process.stderr.write(`User not found: ${args.email}\n`);
      } else {
        console.error(`\n[ERROR] No user found with email: "${args.email}"`);
        console.log('Run `bun run db:jwt --list` to inspect existing users in the database.\n');
      }
      process.exit(1);
    }

    const user = res.rows[0];

    // Compute canonical systemRole
    let systemRole: 'ADMIN' | 'STAF' | 'PATIENT' = 'PATIENT';
    if (user.role_code === 'admin') {
      systemRole = 'ADMIN';
    } else if (
      user.role_code === 'staff_doctor' ||
      user.role_code === 'staff_midwife' ||
      user.role_code === 'staff_worker' ||
      user.staff_id
    ) {
      systemRole = 'STAF';
    }

    const jwtSecret =
      args.secret || getEnvValue('AUTH_JWT_SECRET', 'secret');
    const expiresIn =
      args.expiresIn || getEnvValue('AUTH_JWT_TOKEN_EXPIRES_IN', '7d');

    const payload = {
      id: user.id,
      email: user.email,
      systemRole,
      role: {
        id: user.role_id || null,
        name: systemRole,
      },
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: expiresIn as any });

    if (args.raw) {
      process.stdout.write(token);
      process.exit(0);
    }

    console.log('\n============================================================');
    console.log('  Amanah Healthcare — Generated JWT Bearer Token');
    console.log('============================================================');
    console.log(` User ID         : ${user.id}`);
    console.log(` Email           : ${user.email}`);
    console.log(` Name            : ${user.name}`);
    console.log(` System Role     : ${systemRole}`);
    console.log(` Role Code       : ${user.role_code || 'patient'}`);
    if (user.staff_id) {
      console.log(` Staff ID        : ${user.staff_id}`);
      console.log(` Position Title  : ${user.position_title || '-'}`);
    }
    if (user.practitioner_id) {
      console.log(` Practitioner ID : ${user.practitioner_id}`);
    }
    console.log(` Expires In      : ${expiresIn}`);
    console.log(` Secret Source   : ${args.secret ? 'CLI override' : 'AUTH_JWT_SECRET (.env)'}`);
    console.log('------------------------------------------------------------');
    console.log('JWT TOKEN:');
    console.log(token);
    console.log('------------------------------------------------------------');
    console.log('AUTHORIZATION HEADER:');
    console.log(`Authorization: Bearer ${token}`);
    console.log('------------------------------------------------------------');
    console.log('QUICK CURL TEST:');
    console.log(
      `curl -s -H "Authorization: Bearer ${token}" http://127.0.0.1:3001/api/v1/auth/me`,
    );
    console.log('============================================================\n');
  } catch (error: any) {
    console.error('\n[FATAL] Error executing get-jwt-user script:', error.message || error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
