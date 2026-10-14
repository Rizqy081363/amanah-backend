import { registerAs } from '@nestjs/config';
import { TimeConfig } from './time-config.type';

export function assertIanaTimezone(name: string, label: string): string {
  const looksIana =
    /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$/.test(name) || name === 'UTC';
  let resolvable = false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    resolvable = true;
  } catch {
    resolvable = false;
  }
  if (!name || !looksIana || !resolvable) {
    throw new Error(
      `${label} must be a valid IANA timezone (e.g. Asia/Jakarta). Got: "${name}"`,
    );
  }
  return name;
}

export default registerAs<TimeConfig>('time', () => {
  const need = (k: string) => {
    const v = process.env[k];
    if (v === undefined || v === '') {
      throw new Error(`${k} is required (no default).`);
    }
    return v;
  };
  return Object.freeze({
    clinicTimezone: assertIanaTimezone(
      need('CLINIC_TIMEZONE'),
      'CLINIC_TIMEZONE',
    ),
    processTimezone: assertIanaTimezone(need('PROCESS_TZ'), 'PROCESS_TZ'),
    dbTimezone: assertIanaTimezone(need('DB_TIMEZONE'), 'DB_TIMEZONE'),
  });
});
