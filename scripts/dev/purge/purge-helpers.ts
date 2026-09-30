import type * as readline from 'node:readline/promises';

export function printHeader(title: string): void {
  console.log('\n================================================================================');
  console.log(` [AMANAH DEV CLI] ${title}`);
  console.log('================================================================================');
}

export function printSection(title: string): void {
  console.log(`\n--- ${title} ---`);
}

export function padRight(str: string, len: number): string {
  if (str.length > len) return str.slice(0, len - 3) + '...';
  return str.padEnd(len, ' ');
}

export async function askSafeQuestion(
  rl: readline.Interface,
  prompt: string,
): Promise<string | null> {
  try {
    const ans = await rl.question(prompt);
    return ans !== undefined && ans !== null ? ans.trim() : null;
  } catch {
    return null;
  }
}

export async function confirmPurge(
  rl: readline.Interface,
  targetDescription: string,
  rowCount: number,
  extraWarning?: string,
): Promise<boolean> {
  console.log('\n================================================================================');
  console.log(' [ACTION REQUIRED] CONFIRM PERMANENT PURGE');
  console.log('--------------------------------------------------------------------------------');
  console.log(` Target     : ${targetDescription}`);
  console.log(` Impact     : Approximately ${rowCount} database record(s) will be deleted.`);
  if (extraWarning) {
    console.log(` Notice     : ${extraWarning}`);
  }
  console.log('================================================================================');

  const answer = await askSafeQuestion(
    rl,
    'Type "PURGE" or "y" to execute cascade purge, or "n" to abort: ',
  );
  if (!answer) return false;
  return answer.toUpperCase() === 'PURGE' || answer.toLowerCase() === 'y';
}

export function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}
