import * as fs from 'fs';
import * as path from 'path';

/**
 * Safe-Edit Tooling
 * Solves LLM exact-match whitespace, CRLF line ending mismatches, and fragile search-and-replace errors.
 * OS & Git Level EOL standard: Pure LF (\n).
 */

export type EolType = '\r\n' | '\n';

export interface PatchResult {
  success: boolean;
  message: string;
  originalLines?: number;
  newLines?: number;
  matchedAtLine?: number;
  diffSummary?: string;
}

export function detectEol(content: string): EolType {
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/[^\r]\n/g) || []).length;
  return crlfCount >= lfCount && crlfCount > 0 ? '\r\n' : '\n';
}

export function normalizeEol(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

export function restoreEol(content: string, eol: EolType): string {
  if (eol === '\r\n') {
    return content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  }
  return content.replace(/\r\n/g, '\n');
}

export function detectIndent(content: string): string {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([ \t]+)\S/);
    if (match) {
      return match[1];
    }
  }
  return '  '; // Default 2 spaces
}

/**
 * Find and replace with CRLF normalization
 */
export function replaceExact(
  content: string,
  find: string,
  replacement: string,
  replaceAll: boolean = false
): { updated: string; count: number; lineIndex: number } {
  const targetEol = detectEol(content);
  const normContent = normalizeEol(content);
  const normFind = normalizeEol(find);
  const normReplacement = normalizeEol(replacement);

  let count = 0;
  let firstLine = -1;

  let idx = normContent.indexOf(normFind);
  if (idx === -1) {
    return { updated: content, count: 0, lineIndex: -1 };
  }

  firstLine = normContent.substring(0, idx).split('\n').length;

  let result = normContent;
  if (replaceAll) {
    while (idx !== -1) {
      count++;
      idx = normContent.indexOf(normFind, idx + normFind.length);
    }
    result = normContent.split(normFind).join(normReplacement);
  } else {
    count = 1;
    result = normContent.substring(0, idx) + normReplacement + normContent.substring(idx + normFind.length);
  }

  return {
    updated: restoreEol(result, targetEol),
    count,
    lineIndex: firstLine,
  };
}

/**
 * Fuzzy search by trimmed line sequence
 */
export function replaceFuzzy(
  content: string,
  find: string,
  replacement: string
): { updated: string; count: number; lineIndex: number; matchedLines: string[] } {
  const targetEol = detectEol(content);
  const fileLines = normalizeEol(content).split('\n');
  const findLines = normalizeEol(find).split('\n');
  const replaceLines = normalizeEol(replacement).split('\n');

  // Strip empty leading/trailing lines in find block for robust anchor matching
  let startTrim = 0;
  while (startTrim < findLines.length && findLines[startTrim].trim() === '') {
    startTrim++;
  }
  let endTrim = findLines.length - 1;
  while (endTrim >= startTrim && findLines[endTrim].trim() === '') {
    endTrim--;
  }

  const effectiveFind = findLines.slice(startTrim, endTrim + 1);
  if (effectiveFind.length === 0) {
    return { updated: content, count: 0, lineIndex: -1, matchedLines: [] };
  }

  const matches: number[] = [];
  for (let i = 0; i <= fileLines.length - effectiveFind.length; i++) {
    let matchesBlock = true;
    for (let j = 0; j < effectiveFind.length; j++) {
      if (fileLines[i + j].trim() !== effectiveFind[j].trim()) {
        matchesBlock = false;
        break;
      }
    }
    if (matchesBlock) {
      matches.push(i);
    }
  }

  if (matches.length !== 1) {
    return { updated: content, count: matches.length, lineIndex: matches[0] ?? -1, matchedLines: [] };
  }

  const matchIdx = matches[0];
  const originalIndentation = (fileLines[matchIdx].match(/^(\s*)/) || [''])[0];

  // Adjust indentation of replacement
  const findBaseIndent = (effectiveFind[0].match(/^(\s*)/) || [''])[0].length;
  const adjustedReplacement = replaceLines.map((line) => {
    if (line.trim() === '') return '';
    const lineIndent = (line.match(/^(\s*)/) || [''])[0].length;
    const relIndent = Math.max(0, lineIndent - findBaseIndent);
    return originalIndentation + ' '.repeat(relIndent) + line.trimStart();
  });

  const newFileLines = [
    ...fileLines.slice(0, matchIdx),
    ...adjustedReplacement,
    ...fileLines.slice(matchIdx + effectiveFind.length),
  ];

  return {
    updated: restoreEol(newFileLines.join('\n'), targetEol),
    count: 1,
    lineIndex: matchIdx + 1,
    matchedLines: fileLines.slice(matchIdx, matchIdx + effectiveFind.length),
  };
}

/**
 * Diagnostic analysis when string doesn't match
 */
export function diagnose(content: string, find: string): string[] {
  const notes: string[] = [];
  const fileEol = detectEol(content);
  const findEol = detectEol(find);

  if (fileEol !== findEol && (content.includes('\r\n') || find.includes('\r\n'))) {
    notes.push(`EOL Mismatch detected: File uses ${fileEol === '\r\n' ? 'CRLF (\\r\\n)' : 'LF (\\n)'}, while search target uses ${findEol === '\r\n' ? 'CRLF (\\r\\n)' : 'LF (\\n)'}.`);
  }

  // Check if normalized exact matches
  const normExact = replaceExact(content, find, '');
  if (normExact.count > 0) {
    notes.push(`Exact match succeeds once CRLF/LF is normalized! (Line ${normExact.lineIndex})`);
    return notes;
  }

  // Check fuzzy
  const fuzzy = replaceFuzzy(content, find, '');
  if (fuzzy.count === 1) {
    notes.push(`Trimmed/whitespace-tolerant match found at line ${fuzzy.lineIndex}! (Difference is due to indentation or trailing spaces)`);
    return notes;
  } else if (fuzzy.count > 1) {
    notes.push(`Ambiguous: Trimmed pattern matched in ${fuzzy.count} different places in the file.`);
    return notes;
  }

  // Check if first line of target exists
  const firstLine = normalizeEol(find).split('\n').map((l) => l.trim()).find((l) => l.length > 5);
  if (firstLine) {
    const fileLines = normalizeEol(content).split('\n');
    const candidates: number[] = [];
    fileLines.forEach((l, idx) => {
      if (l.includes(firstLine) || l.trim() === firstLine) {
        candidates.push(idx + 1);
      }
    });
    if (candidates.length > 0) {
      notes.push(`Anchor line "${firstLine.slice(0, 40)}..." was found on line(s): ${candidates.join(', ')}. Subsequent lines likely drifted or differed.`);
    } else {
      notes.push(`Anchor line "${firstLine.slice(0, 40)}..." was NOT found anywhere in the file.`);
    }
  }

  return notes;
}

/**
 * JSON safe manipulation
 */
export function jsonSet(filePath: string, jsonPath: string, valueRaw: string): void {
  const content = fs.readFileSync(filePath, 'utf8');
  const eol = detectEol(content);
  const indent = detectIndent(content);
  const obj = JSON.parse(content);

  let val: any;
  try {
    val = JSON.parse(valueRaw);
  } catch {
    val = valueRaw;
  }

  const parts = jsonPath.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!(p in curr) || typeof curr[p] !== 'object' || curr[p] === null) {
      curr[p] = {};
    }
    curr = curr[p];
  }
  curr[parts[parts.length - 1]] = val;

  const serialized = JSON.stringify(obj, null, indent);
  fs.writeFileSync(filePath, restoreEol(serialized + '\n', eol), 'utf8');
}

export function jsonMerge(filePath: string, jsonPath: string, valueRaw: string): void {
  const content = fs.readFileSync(filePath, 'utf8');
  const eol = detectEol(content);
  const indent = detectIndent(content);
  const obj = JSON.parse(content);

  const val = JSON.parse(valueRaw);
  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    throw new Error('jsonMerge requires a JSON object to merge.');
  }

  let curr = obj;
  if (jsonPath && jsonPath !== '.') {
    const parts = jsonPath.split('.');
    for (const p of parts) {
      if (!(p in curr) || typeof curr[p] !== 'object' || curr[p] === null) {
        curr[p] = {};
      }
      curr = curr[p];
    }
  }

  Object.assign(curr, val);
  const serialized = JSON.stringify(obj, null, indent);
  fs.writeFileSync(filePath, restoreEol(serialized + '\n', eol), 'utf8');
}

/**
 * CLI Handler
 */
function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(`
Safe-Edit CLI (Anti-Fragile Patching Engine)

Commands:
  replace     --file <path> --find <text|@file> --replace <text|@file> [--fuzzy] [--all] [--dry-run]
  json-set    --file <path> --key <key.path> --value <json_or_string>
  json-merge  --file <path> [--key <key.path>] --value <json_object>
  check       --file <path> --find <text|@file>
  full-write  --file <path> --content <text|@file>
`);
    return;
  }

  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
    return undefined;
  };

  const hasFlag = (flag: string): boolean => args.includes(flag);

  const resolveText = (val: string | undefined): string => {
    if (!val) return '';
    if (val.startsWith('@') && fs.existsSync(val.slice(1))) {
      return fs.readFileSync(val.slice(1), 'utf8');
    }
    return val;
  };

  const filePath = getArg('--file');
  if (!filePath && cmd !== 'help') {
    console.error('Error: --file argument is required.');
    process.exit(1);
  }

  const absPath = path.resolve(process.cwd(), filePath!);
  if (!fs.existsSync(absPath)) {
    console.error(`Error: File not found: ${absPath}`);
    process.exit(1);
  }

  if (cmd === 'replace') {
    const rawFind = resolveText(getArg('--find'));
    const rawReplace = resolveText(getArg('--replace'));
    const fuzzy = hasFlag('--fuzzy');
    const replaceAll = hasFlag('--all');
    const dryRun = hasFlag('--dry-run');

    if (!rawFind) {
      console.error('Error: --find argument is required.');
      process.exit(1);
    }

    const content = fs.readFileSync(absPath, 'utf8');
    let result = replaceExact(content, rawFind, rawReplace, replaceAll);

    let matchType = 'exact (CRLF-normalized)';
    if (result.count === 0 && fuzzy) {
      const fuzzyRes = replaceFuzzy(content, rawFind, rawReplace);
      if (fuzzyRes.count === 1) {
        result = {
          updated: fuzzyRes.updated,
          count: 1,
          lineIndex: fuzzyRes.lineIndex,
        };
        matchType = 'fuzzy (whitespace-tolerant)';
      }
    }

    if (result.count === 0) {
      console.error(`[FAIL] Target content not found in ${path.basename(absPath)}.`);
      const diag = diagnose(content, rawFind);
      if (diag.length > 0) {
        console.error('Diagnostic findings:');
        diag.forEach((d) => console.error(`  - ${d}`));
      }
      process.exit(1);
    }

    if (result.count > 1 && !replaceAll) {
      console.error(`[AMBIGUOUS] Target content found in ${result.count} locations. Use --all to replace all.`);
      process.exit(2);
    }

    console.log(`[SUCCESS] Matched using ${matchType} at line ${result.lineIndex}. Replaced ${result.count} block(s).`);

    if (!dryRun) {
      fs.writeFileSync(absPath, result.updated, 'utf8');
      console.log(`[SAVED] Updated ${absPath}`);
    } else {
      console.log(`[DRY-RUN] No changes written to disk.`);
    }
  } else if (cmd === 'check') {
    const rawFind = resolveText(getArg('--find'));
    const content = fs.readFileSync(absPath, 'utf8');
    const exact = replaceExact(content, rawFind, '');
    if (exact.count > 0) {
      console.log(`[EXACT MATCH] Found at line ${exact.lineIndex} (count: ${exact.count}).`);
      return;
    }
    const fuzzy = replaceFuzzy(content, rawFind, '');
    if (fuzzy.count === 1) {
      console.log(`[FUZZY MATCH] Found at line ${fuzzy.lineIndex} with indentation/whitespace differences.`);
      return;
    }
    console.log(`[NOT FOUND] Target not matched.`);
    const diag = diagnose(content, rawFind);
    diag.forEach((d) => console.log(`  - ${d}`));
  } else if (cmd === 'json-set') {
    const key = getArg('--key');
    const val = getArg('--value');
    if (!key || val === undefined) {
      console.error('Error: --key and --value are required for json-set.');
      process.exit(1);
    }
    jsonSet(absPath, key, val);
    console.log(`[SUCCESS] Set JSON key "${key}" in ${path.basename(absPath)}.`);
  } else if (cmd === 'json-merge') {
    const key = getArg('--key') || '.';
    const val = getArg('--value');
    if (!val) {
      console.error('Error: --value is required for json-merge.');
      process.exit(1);
    }
    jsonMerge(absPath, key, val);
    console.log(`[SUCCESS] Merged JSON into "${key}" in ${path.basename(absPath)}.`);
  } else if (cmd === 'full-write') {
    const rawContent = resolveText(getArg('--content'));
    fs.writeFileSync(absPath, rawContent, 'utf8');
    console.log(`[SUCCESS] Rewrote ${path.basename(absPath)} entirely.`);
  } else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  }
}

if (import.meta.main || require.main === module) {
  main();
}
