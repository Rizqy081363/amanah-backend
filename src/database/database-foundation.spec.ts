import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const documentedSchemaPath = resolve(
  process.cwd(),
  'docs/database-amanah-healthcare/schema.sql',
);
const firstMigrationPath = resolve(
  process.cwd(),
  'src/database/migrations/0000_amanah_foundation.sql',
);
const developmentSeedDataPath = resolve(
  process.cwd(),
  'src/database/seeds/drizzle/dev-seed.data.ts',
);

const legacyTableNames = [
  'user',
  'role',
  'status',
  'session',
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

const extractObjectNames = (sql: string, pattern: RegExp): string[] => {
  const names = new Set<string>();
  for (const match of sql.matchAll(pattern)) {
    names.add(match[1]);
  }

  return [...names].sort();
};

const readSql = (filePath: string): string => readFileSync(filePath, 'utf8');

const readDevelopmentSeedSource = (): string => {
  expect(existsSync(developmentSeedDataPath)).toBe(true);

  return readFileSync(developmentSeedDataPath, 'utf8');
};

const extractSourceSection = (
  source: string,
  startMarker: string,
  endMarker: string,
): string => {
  const startIndex = source.indexOf(startMarker);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const endIndex = source.indexOf(endMarker, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
};

const extractQuotedValues = (source: string, pattern: RegExp): string[] => {
  const values = new Set<string>();
  for (const match of source.matchAll(pattern)) {
    values.add(match[1]);
  }

  return [...values].sort();
};

const extractUpdatedAtTriggerTables = (sql: string): string[] => {
  const startMarker = 'FOREACH table_name IN ARRAY ARRAY[';
  const startIndex = sql.indexOf(startMarker);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const blockStartIndex = startIndex + startMarker.length;
  const loopIndex = sql.indexOf('LOOP', blockStartIndex);
  const blockEndIndex = sql.lastIndexOf(']', loopIndex);
  expect(loopIndex).toBeGreaterThan(blockStartIndex);
  expect(blockEndIndex).toBeGreaterThan(blockStartIndex);

  return extractQuotedValues(
    sql.slice(blockStartIndex, blockEndIndex),
    /'([^']+)'/g,
  );
};

describe('database foundation', () => {
  it('should keep the first migration aligned with documented schema objects', () => {
    expect(existsSync(firstMigrationPath)).toBe(true);

    const documentedSql = readSql(documentedSchemaPath);
    const migrationSql = readSql(firstMigrationPath);

    expect(
      extractObjectNames(documentedSql, /^CREATE TYPE ([a-z_]+) AS ENUM/gm),
    ).toEqual(
      extractObjectNames(migrationSql, /^CREATE TYPE ([a-z_]+) AS ENUM/gm),
    );
    expect(
      extractObjectNames(documentedSql, /^CREATE TABLE ([a-z_]+) \(/gm),
    ).toEqual(extractObjectNames(migrationSql, /^CREATE TABLE ([a-z_]+) \(/gm));
    expect(
      extractObjectNames(
        documentedSql,
        /^CREATE (?:UNIQUE )?INDEX ([a-z_]+)\b/gm,
      ),
    ).toEqual(
      extractObjectNames(
        migrationSql,
        /^CREATE (?:UNIQUE )?INDEX ([a-z_]+)\b/gm,
      ),
    );
    expect(extractUpdatedAtTriggerTables(documentedSql)).toEqual(
      extractUpdatedAtTriggerTables(migrationSql),
    );
  });

  it('should not carry invalid legacy table names into the first migration', () => {
    expect(existsSync(firstMigrationPath)).toBe(true);

    const migrationSql = readSql(firstMigrationPath);

    for (const tableName of legacyTableNames) {
      expect(migrationSql).not.toContain(`CREATE TABLE "${tableName}"`);
      expect(migrationSql).not.toContain(`CREATE TABLE ${tableName} (`);
    }
  });

  it('should define realistic development users under the requested count ceiling', () => {
    const seedSource = readDevelopmentSeedSource();
    const roleSection = extractSourceSection(
      seedSource,
      'export const DEVELOPMENT_ROLE_SEEDS',
      '] as const;',
    );
    const userSection = extractSourceSection(
      seedSource,
      'export const DEVELOPMENT_USER_SEEDS',
      '];',
    );
    const staticUserSection = userSection.slice(
      0,
      userSection.indexOf('...Array.from'),
    );
    const generatedUserCount = Number(
      userSection.match(/Array\.from\(\{ length: (\d+) \}/)?.[1] ?? 0,
    );
    const staticEmails = extractQuotedValues(
      staticUserSection,
      /email: '([^']+)'/g,
    );
    const roleCodes = new Set(
      extractQuotedValues(roleSection, /code: '([^']+)'/g),
    );
    const staticUserRoleCodes = extractQuotedValues(
      staticUserSection,
      /roleCode: '([^']+)'/g,
    );
    const developmentUserCount = staticEmails.length + generatedUserCount;

    expect(seedSource).toContain("from '@faker-js/faker'");
    expect(seedSource).toContain('faker.seed(');
    expect(developmentUserCount).toBeGreaterThanOrEqual(11);
    expect(developmentUserCount).toBeLessThan(20);
    expect(roleCodes).toEqual(
      new Set([
        'admin',
        'staff_doctor',
        'staff_midwife',
        'staff_worker',
        'patient',
      ]),
    );
    expect(
      staticUserRoleCodes.every((roleCode) => roleCodes.has(roleCode)),
    ).toBe(true);
    expect(staticUserRoleCodes).toContain('admin');
    expect(staticUserRoleCodes).toContain('staff_doctor');
    expect(generatedUserCount).toBeGreaterThan(0);
    expect(seedSource).toContain("roleCode: 'patient'");
  });
});
