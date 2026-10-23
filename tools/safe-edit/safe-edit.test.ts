import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  detectEol,
  normalizeEol,
  restoreEol,
  replaceExact,
  replaceFuzzy,
  diagnose,
  jsonSet,
  jsonMerge,
} from './safe-edit';

describe('Safe-Edit Patcher Engine', () => {
  it('detects CRLF and LF correctly', () => {
    expect(detectEol('hello\r\nworld\r\n')).toBe('\r\n');
    expect(detectEol('hello\nworld\n')).toBe('\n');
  });

  it('replaces exact content regardless of CRLF vs LF', () => {
    const fileWithCrlf = 'line 1\r\nline 2\r\nline 3\r\n';
    const findWithLf = 'line 2\n';
    const replaceWithLf = 'line TWO\n';

    const res = replaceExact(fileWithCrlf, findWithLf, replaceWithLf);
    expect(res.count).toBe(1);
    expect(res.lineIndex).toBe(2);
    expect(res.updated).toBe('line 1\r\nline TWO\r\nline 3\r\n');
  });

  it('performs whitespace-tolerant fuzzy replacement', () => {
    const fileContent = '  function test() {\r\n    const a = 1;\r\n    return a;\r\n  }';
    const findContent = '    const a = 1;\n    return a;';
    const replaceContent = '    const b = 2;\n    return b;';

    const res = replaceFuzzy(fileContent, findContent, replaceContent);
    expect(res.count).toBe(1);
    expect(res.lineIndex).toBe(2);
    expect(res.updated).toContain('const b = 2;');
  });

  it('diagnoses EOL and whitespace mismatches accurately', () => {
    const fileWithCrlf = 'const x = 10;\r\nconst y = 20;\r\n';
    const targetWithLf = 'const x = 10;\nconst y = 20;\n';

    const diag = diagnose(fileWithCrlf, targetWithLf);
    expect(diag.length).toBeGreaterThan(0);
    expect(diag.some((d) => d.includes('CRLF/LF is normalized'))).toBe(true);
  });

  it('modifies JSON safely without regex string replacement', () => {
    const tmp = path.join(os.tmpdir(), `test-json-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ name: 'test', scripts: {} }, null, 2), 'utf8');

    jsonSet(tmp, 'scripts.build', 'bun run build');
    const updated = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    expect(updated.scripts.build).toBe('bun run build');

    jsonMerge(tmp, '.', JSON.stringify({ version: '1.0.0' }));
    const merged = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    expect(merged.version).toBe('1.0.0');

    fs.unlinkSync(tmp);
  });
});
