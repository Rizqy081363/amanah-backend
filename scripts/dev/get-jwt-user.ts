#!/usr/bin/env bun
import jwt from 'jsonwebtoken';
import { ROLE_AUDIENCE } from '../../src/common/constants/role-audience.constants';
import {
  createDbPool,
  getEnvValue,
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
Amanah Healthcare — Dynamic JWT Token Generator CLI (RBAC & Permissions Aware)

Usage:
  bun run db:jwt --email <email> [options]
  bun run db:jwt --email:<email> [options]
  bun ./scripts/dev/get-jwt-user.ts --email <email>

Options:
  --email, -e <email>      User email to generate JWT for (required unless --list)
  --expires, -x <time>     Token expiry (default: "7d" or AUTH_JWT_TOKEN_EXPIRES_IN)
  --secret, -s <secret>    JWT signing secret (default: AUTH_JWT_SECRET from .env, or "secret")
  --raw, -r                Print ONLY the JWT token string (ideal for scripting/pipe)
  --list, -l               List all available active users, roles, and audience
  --help, -h               Show this help message

Examples:
  bun run db:jwt --email admin@amanah.com
  bun run db:jwt --email zikrifadhiilahahmad@gmail.com
  bun run db:jwt --email admin@amanah.com --raw
  bun run db:jwt --list
`);
}

async function listUsers(pool: any): Promise<void> {
  const query = `
    SELECT 
      u.id, 
      u.email, 
      u.name, 
      COALESCE(r_ur.name, r_sp.name) as role_name, 
      COALESCE(r_ur.code, r_sp.code) as role_code,
      COALESCE(r_ur.audience, r_sp.audience) as role_audience,
      sp.position_title
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r_ur ON ur.role_id = r_ur.id
    LEFT JOIN staff_profiles sp ON u.id = sp.user_id
    LEFT JOIN roles r_sp ON sp.role_id = r_sp.id
    ORDER BY u.created_at DESC
    LIMIT 50;
  `;

  const res = await pool.query(query);

  console.log('\n=== Available Users in Database ===\n');
  console.log(
    'Email'.padEnd(36) +
      'Role Code'.padEnd(16) +
      'Audience'.padEnd(12) +
      'Name'.padEnd(28) +
      'User ID',
  );
  console.log('-'.repeat(128));

  for (const row of res.rows) {
    const roleCode = row.role_code || (row.position_title ? 'staff' : 'patient');
    const audience = row.role_audience || (row.position_title ? 'internal' : 'external');
    console.log(
      (row.email || '(no email)').padEnd(36) +
        roleCode.padEnd(16) +
        audience.padEnd(12) +
        (row.name || '-').padEnd(28) +
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
        u.auth_version,
        u.name, 
        u.phone,
        COALESCE(r_ur.id, r_sp.id) as role_id, 
        COALESCE(r_ur.code, r_sp.code) as role_code, 
        COALESCE(r_ur.name, r_sp.name) as role_name,
        COALESCE(r_ur.audience, r_sp.audience) as role_audience,
        COALESCE(r_ur.is_system, r_sp.is_system, false) as role_is_system,
        sp.id as staff_id,
        sp.position_title,
        sp.staff_code,
        doc.id as practitioner_id
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r_ur ON ur.role_id = r_ur.id
      LEFT JOIN staff_profiles sp ON u.id = sp.user_id
      LEFT JOIN roles r_sp ON sp.role_id = r_sp.id
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

    // Fetch granular permissions assigned to the role
    const permissionCodes: string[] = [];
    if (user.role_id) {
      const permRes = await pool.query(
        `SELECT p.code 
         FROM role_permissions rp
         JOIN permissions p ON rp.permission_id = p.id
         WHERE rp.role_id = $1
         ORDER BY p.code;`,
        [user.role_id],
      );
      for (const row of permRes.rows) {
        permissionCodes.push(row.code);
      }
    }

    const roleCode = user.role_code || null;
    const systemRole = roleCode;

    const jwtSecret =
      args.secret || getEnvValue('AUTH_JWT_SECRET', 'secret');
    const expiresIn =
      args.expiresIn || getEnvValue('AUTH_JWT_TOKEN_EXPIRES_IN', '7d');

    const payload = {
      id: user.id,
      email: user.email,
      authVersion: user.auth_version,
      roleCode,
      systemRole,
      role: user.role_id
        ? {
            id: user.role_id,
            code: user.role_code,
            name: user.role_name,
            audience: user.role_audience,
          }
        : null,
      permissions: permissionCodes,
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: expiresIn as any });

    if (args.raw) {
      process.stdout.write(token);
      process.exit(0);
    }

    console.log('\n============================================================');
    console.log('  Amanah Healthcare — Dynamic JWT Bearer Token');
    console.log('============================================================');
    console.log(` User ID         : ${user.id}`);
    console.log(` Email           : ${user.email}`);
    console.log(` Name            : ${user.name}`);
    console.log(` Role Code       : ${roleCode}`);
    console.log(` Role Name       : ${user.role_name || '(none)'}`);
    console.log(` Role Audience   : ${user.role_audience || '(unassigned)'}`);
    console.log(` System Role     : ${systemRole}`);
    console.log(` Permissions     : ${permissionCodes.length} assigned (${permissionCodes.includes('*') ? 'WILDCARD (*)' : permissionCodes.slice(0, 5).join(', ') + (permissionCodes.length > 5 ? '...' : '')})`);
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
