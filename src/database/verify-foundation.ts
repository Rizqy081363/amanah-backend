import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, type QueryResultRow } from 'pg';

type DatabaseObjectExpectation = {
  enumNames: string[];
  indexNames: string[];
  tableNames: string[];
  triggerTables: string[];
};

const DEFAULT_POSTGRES_HOST_PORT = 5433;
const DEFAULT_DATABASE_MAX_POOL_SIZE = 5;
const MIGRATIONS_DIR = resolve(process.cwd(), 'src/database/migrations');
const REQUIRED_EXTENSION_NAMES = ['pgcrypto', 'citext', 'pg_trgm'] as const;
const LEGACY_TABLE_NAMES = [
  'role',
  'status',
  'patients',
  'poliklinik',
  'layanan_poli',
  'kunjungan_pasien',
  'rekam_medis_kunjungan',
  'staffs',
  'staff_schedules',
  'staff_attendances',
  'staff_leaves',
] as const;
const MINIMUM_DEVELOPMENT_USER_COUNT = 11;
const MAXIMUM_DEVELOPMENT_USER_COUNT = 19;

const getDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DATABASE_HOST || 'localhost';
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const port = isLocalHost
    ? (process.env.POSTGRES_HOST_PORT ||
        process.env.DATABASE_PORT ||
        String(DEFAULT_POSTGRES_HOST_PORT))
    : (process.env.DATABASE_PORT || '5432');
  const username = process.env.DATABASE_USERNAME || 'amanah';
  const password = process.env.DATABASE_PASSWORD || 'amanah_secret';
  const database = process.env.DATABASE_NAME || 'amanah_healthcare';

  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
};

const extractObjectNames = (sql: string, pattern: RegExp): string[] => {
  const names = new Set<string>();
  for (const match of sql.matchAll(pattern)) {
    const name = match.slice(1).find(Boolean);
    if (name) {
      names.add(name);
    }
  }

  return [...names].sort();
};

const extractUpdatedAtTriggerTables = (sql: string): string[] => {
  const triggerBlocks: string[] = [];
  const startMarker = 'FOREACH table_name IN ARRAY ARRAY[';
  let searchFromIndex = 0;

  while (searchFromIndex < sql.length) {
    const startIndex = sql.indexOf(startMarker, searchFromIndex);
    if (startIndex === -1) {
      break;
    }

    const blockStartIndex = startIndex + startMarker.length;
    const loopIndex = sql.indexOf('LOOP', blockStartIndex);
    const blockEndIndex = sql.lastIndexOf(']', loopIndex);

    if (loopIndex === -1 || blockEndIndex === -1) {
      throw new Error('Unable to parse updated_at trigger table list.');
    }

    triggerBlocks.push(sql.slice(blockStartIndex, blockEndIndex));
    searchFromIndex = loopIndex + 'LOOP'.length;
  }

  if (triggerBlocks.length === 0) {
    throw new Error('Unable to find updated_at trigger table list.');
  }

  return extractObjectNames(triggerBlocks.join('\n'), /'([^']+)'/g);
};

const readMigrationSql = (): string =>
  readdirSync(MIGRATIONS_DIR)
    .filter((fileName) => /^\d+.*\.sql$/.test(fileName))
    .sort()
    .map((fileName) => readFileSync(resolve(MIGRATIONS_DIR, fileName), 'utf8'))
    .join('\n');

const SQL_IDENTIFIER_PATTERN = '(?:"([^"]+)"|([a-z_][a-z0-9_]*))';

const createObjectPattern = (prefix: string, suffix = ''): RegExp =>
  new RegExp(`^\\s*${prefix} ${SQL_IDENTIFIER_PATTERN}${suffix}`, 'gm');

const CREATE_ENUM_PATTERN = createObjectPattern('CREATE TYPE', ' AS ENUM');
const CREATE_TABLE_PATTERN = createObjectPattern(
  'CREATE TABLE(?: IF NOT EXISTS)?',
  ' \\(',
);
const CREATE_INDEX_PATTERN = createObjectPattern(
  'CREATE (?:UNIQUE )?INDEX(?: IF NOT EXISTS)?',
);

const extractExpectedObjects = (
  migrationSql: string,
): DatabaseObjectExpectation => {
  return {
    enumNames: extractObjectNames(migrationSql, CREATE_ENUM_PATTERN),
    tableNames: extractObjectNames(migrationSql, CREATE_TABLE_PATTERN),
    indexNames: extractObjectNames(migrationSql, CREATE_INDEX_PATTERN),
    triggerTables: extractUpdatedAtTriggerTables(migrationSql),
  };
};

const getExpectedObjects = (): DatabaseObjectExpectation => {
  return extractExpectedObjects(readMigrationSql());
};

const queryNames = async <TRow extends QueryResultRow>(
  pool: Pool,
  text: string,
  values: unknown[],
  key: keyof TRow,
): Promise<string[]> => {
  const result = await pool.query<TRow>(text, values);

  return result.rows.map((row) => String(row[key])).sort();
};

const getMissingNames = (expected: readonly string[], actual: string[]) => {
  const actualNames = new Set(actual);

  return expected.filter((name) => !actualNames.has(name));
};

const assertNoMissingNames = (
  label: string,
  expected: readonly string[],
  actual: string[],
) => {
  const missingNames = getMissingNames(expected, actual);

  if (missingNames.length > 0) {
    throw new Error(
      `${label} missing from database: ${missingNames.join(', ')}`,
    );
  }
};

const verifyFoundation = async (): Promise<void> => {
  const expected = getExpectedObjects();
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: DEFAULT_DATABASE_MAX_POOL_SIZE,
  });

  try {
    const extensionNames = await queryNames<{ extname: string }>(
      pool,
      'SELECT extname FROM pg_extension WHERE extname = ANY($1::text[])',
      [[...REQUIRED_EXTENSION_NAMES]],
      'extname',
    );
    assertNoMissingNames(
      'Required extensions',
      REQUIRED_EXTENSION_NAMES,
      extensionNames,
    );

    const enumNames = await queryNames<{ typname: string }>(
      pool,
      'SELECT typname FROM pg_type WHERE typname = ANY($1::text[])',
      [expected.enumNames],
      'typname',
    );
    assertNoMissingNames('Enums', expected.enumNames, enumNames);

    const tableNames = await queryNames<{ tablename: string }>(
      pool,
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
      [expected.tableNames],
      'tablename',
    );
    assertNoMissingNames('Tables', expected.tableNames, tableNames);

    const indexNames = await queryNames<{ indexname: string }>(
      pool,
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])",
      [expected.indexNames],
      'indexname',
    );
    assertNoMissingNames('Indexes', expected.indexNames, indexNames);

    const triggerTables = await queryNames<{ relname: string }>(
      pool,
      `
        SELECT c.relname
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND NOT t.tgisinternal
          AND t.tgname = 'set_updated_at'
          AND c.relname = ANY($1::text[])
      `,
      [expected.triggerTables],
      'relname',
    );
    assertNoMissingNames(
      'set_updated_at triggers',
      expected.triggerTables,
      triggerTables,
    );

    const legacyTableNames = await queryNames<{ tablename: string }>(
      pool,
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
      [[...LEGACY_TABLE_NAMES]],
      'tablename',
    );
    if (legacyTableNames.length > 0) {
      throw new Error(
        `Legacy tables should not exist: ${legacyTableNames.join(', ')}`,
      );
    }

    const userCountResult = await pool.query<{ count: string }>(
      "SELECT count(*)::int AS count FROM users WHERE email LIKE '%@amanah-healthcare.test'",
    );
    const developmentUserCount = Number(userCountResult.rows[0]?.count ?? 0);
    if (
      developmentUserCount < MINIMUM_DEVELOPMENT_USER_COUNT ||
      developmentUserCount > MAXIMUM_DEVELOPMENT_USER_COUNT
    ) {
      throw new Error(
        `Expected ${MINIMUM_DEVELOPMENT_USER_COUNT}-${MAXIMUM_DEVELOPMENT_USER_COUNT} development users, found ${developmentUserCount}.`,
      );
    }

    console.log(
      [
        `Verified ${expected.tableNames.length} tables`,
        `${expected.enumNames.length} enums`,
        `${expected.indexNames.length} documented indexes`,
        `${expected.triggerTables.length} update triggers`,
        `${developmentUserCount} development users`,
      ].join(', '),
    );
  } finally {
    await pool.end();
  }
};

verifyFoundation().catch((error) => {
  console.error('Database foundation verification failed:', error);
  process.exit(1);
});
