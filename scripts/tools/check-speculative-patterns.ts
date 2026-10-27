/**
 * Omni Agnostic AST Architecture & Pattern Recognition Scanner
 *
 * Tooling analisis statis murni berbasis TypeScript Compiler AST (Zero Hardcoded Domain Keywords).
 * Dirancang untuk mendeteksi spekulasi data, hardcoding (API/magic literal), spaghetti control-flow,
 * serta pelanggaran integritas arsitektur secara agnostik di berbagai codebase TypeScript.
 *
 * Mode Pemindaian (--mode=... atau --omni):
 * - default / speculative : Hanya memindai pola spekulasi & defensive fallback (Default).
 * - hardcoding            : Memindai hardcoded endpoint/URL inline, konstanta API flat (bukan objek),
 *                           magic string berulang, dan magic number.
 * - spaghetti             : Memindai nested ternary, deep control-flow nesting (arrowhead),
 *                           cyclomatic complexity tinggi, dan parameter fungsi berlebih.
 * - architecture          : Memindai empty/swallowed catch block, penyelundupan tipe (as any / double cast),
 *                           mutable exported state (export let), serta console artifact.
 * - omni                  : Mengaktifkan seluruh dimensi detektor di atas secara simultan.
 *
 * Anda juga dapat menggabungkan mode dengan koma, contoh: --mode=speculative,hardcoding
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ScanCategory = 'SPECULATIVE' | 'HARDCODING' | 'SPAGHETTI' | 'ARCHITECTURE';

export type ScanMode = 'default' | 'speculative' | 'hardcoding' | 'spaghetti' | 'architecture' | 'omni';

export interface AgnosticViolation {
  file: string;
  line: number;
  column: number;
  severity: Severity;
  category: ScanCategory;
  pattern: string;
  message: string;
  snippet: string;
  recommendation: string;
}

export interface ScannerConfig {
  targetDir: string;
  minSeverity: Severity;
  failOn: Severity;
  modes: Set<ScanCategory>;
  modeLabel: string;
  json: boolean;
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

const SEVERITY_BADGES: Record<Severity, string> = {
  CRITICAL: '\x1b[41m\x1b[37m\x1b[1m [CRITICAL] \x1b[0m',
  HIGH: '\x1b[33m\x1b[1m[HIGH]\x1b[0m',
  MEDIUM: '\x1b[36m\x1b[1m[MEDIUM]\x1b[0m',
  LOW: '\x1b[90m[LOW]\x1b[0m'
};

const CATEGORY_BADGES: Record<ScanCategory, string> = {
  SPECULATIVE: '\x1b[35m[SPECULATIVE]\x1b[0m',
  HARDCODING: '\x1b[34m[HARDCODING]\x1b[0m',
  SPAGHETTI: '\x1b[33m[SPAGHETTI]\x1b[0m',
  ARCHITECTURE: '\x1b[32m[ARCHITECTURE]\x1b[0m'
};

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  'scripts',
  'tests',
  'test',
  '__tests__',
  'tools',
  'db-atlas',
  'data',
  'backup',
  '.agents',
  '.git',
]);

const ALLOWED_MAGIC_NUMBERS = new Set([-1, 0, 1, 2, 10, 100, 1000]);

const DOM_KEYBOARD_MODIFIERS = new Set(['metaKey', 'ctrlKey', 'altKey', 'shiftKey']);

function isFallbackOperator(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.BarBarToken ||
    kind === ts.SyntaxKind.QuestionQuestionToken
  );
}

/**
 * Meratakan pohon BinaryExpression untuk operator tertentu (misal: '||' atau '??')
 */
function flattenBinaryTree(node: ts.Node, op: ts.SyntaxKind): ts.Node[] {
  const list: ts.Node[] = [];
  const treatAsFallback = isFallbackOperator(op);
  function walk(n: ts.Node) {
    let target = n;
    while (ts.isParenthesizedExpression(target)) {
      target = target.expression;
    }
    const matchesOp = treatAsFallback
      ? ts.isBinaryExpression(target) &&
        isFallbackOperator(target.operatorToken.kind)
      : ts.isBinaryExpression(target) && target.operatorToken.kind === op;

    if (matchesOp) {
      walk((target as ts.BinaryExpression).left);
      walk((target as ts.BinaryExpression).right);
    } else {
      list.push(target);
    }
  }
  walk(node);
  return list;
}

/**
 * Mengekstrak teks dari node tanpa whitespace berlebih
 */
function getCleanText(node: ts.Node, sourceFile: ts.SourceFile): string {
  return node.getText(sourceFile).trim().replace(/\s+/g, ' ');
}

/**
 * Memotong snippet agar tetap rapi pada output terminal
 */
function formatSnippet(text: string, maxLength = 120): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) + '...' : cleaned;
}

/**
 * Menguji apakah node adalah kondisi boolean (misal: !x, a === b, a > b)
 */
function isBooleanPredicateNode(node: ts.Node): boolean {
  let target = node;
  while (ts.isParenthesizedExpression(target)) {
    target = target.expression;
  }
  if (ts.isPrefixUnaryExpression(target) && target.operator === ts.SyntaxKind.ExclamationToken) {
    return true;
  }
  if (ts.isBinaryExpression(target)) {
    const k = target.operatorToken.kind;
    return (
      k === ts.SyntaxKind.EqualsEqualsToken ||
      k === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      k === ts.SyntaxKind.ExclamationEqualsToken ||
      k === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      k === ts.SyntaxKind.GreaterThanToken ||
      k === ts.SyntaxKind.GreaterThanEqualsToken ||
      k === ts.SyntaxKind.LessThanToken ||
      k === ts.SyntaxKind.LessThanEqualsToken ||
      k === ts.SyntaxKind.InstanceOfKeyword ||
      k === ts.SyntaxKind.InKeyword
    );
  }
  return false;
}

/**
 * Mengambil informasi subject dan literal string dari node perbandingan equality (== / === / != / !==)
 */
function extractEqualityStringComparison(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  allowInequality = false
): { subject: string; literal: string } | null {
  let target = node;
  while (ts.isParenthesizedExpression(target)) {
    target = target.expression;
  }
  if (!ts.isBinaryExpression(target)) return null;
  const k = target.operatorToken.kind;
  const isEq = k === ts.SyntaxKind.EqualsEqualsToken || k === ts.SyntaxKind.EqualsEqualsEqualsToken;
  const isNeq =
    allowInequality &&
    (k === ts.SyntaxKind.ExclamationEqualsToken || k === ts.SyntaxKind.ExclamationEqualsEqualsToken);

  if (!isEq && !isNeq) {
    return null;
  }

  if (ts.isStringLiteral(target.right) || ts.isNoSubstitutionTemplateLiteral(target.right)) {
    return {
      subject: getCleanText(target.left, sourceFile),
      literal: target.right.text
    };
  }
  if (ts.isStringLiteral(target.left) || ts.isNoSubstitutionTemplateLiteral(target.left)) {
    return {
      subject: getCleanText(target.right, sourceFile),
      literal: target.left.text
    };
  }
  return null;
}

/**
 * Mengambil base receiver dan property name dari PropertyAccessExpression
 */
function extractPropertyAccess(
  node: ts.Node,
  sourceFile: ts.SourceFile
): { receiver: string; property: string } | null {
  let target = node;
  while (
    ts.isParenthesizedExpression(target) ||
    ts.isNonNullExpression(target) ||
    ts.isCallExpression(target)
  ) {
    target = target.expression;
  }

  if (ts.isPropertyAccessExpression(target)) {
    return {
      receiver: getCleanText(target.expression, sourceFile),
      property: target.name.text
    };
  }
  return null;
}

/**
 * Menghitung kedalaman rantai optional chaining (contoh: a?.b?.c?.d)
 */
function getOptionalChainDepth(node: ts.Node): number {
  let depth = 0;
  let current: ts.Node = node;
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current) ||
    ts.isCallExpression(current)
  ) {
    if (current.questionDotToken) {
      depth++;
    }
    current = current.expression;
  }
  return depth;
}

/**
 * Memeriksa apakah string menyerupai URL protokol atau path API/endpoint terstruktur
 */
function isEndpointOrUrlString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Protokol eksplisit: http://, https://, ws://, wss://, graphql://
  if (/^(https?|wss?|ftp|graphql):\/\/[^\s]+/i.test(trimmed)) {
    return true;
  }

  // Pola endpoint REST/API umum: /api/..., /v1/..., /v2/..., /graphql, /auth/..., /webhook/...
  if (/^\/(api|v\d+|graphql|oauth|webhooks?|rpc|internal|public)(\/|$)/i.test(trimmed)) {
    return true;
  }

  // Path multi-segmen dengan parameter dinamis atau minimal 3 segmen path non-aset
  // Kecualikan ekstensi file statis (.svg, .png, .css, .js, .json)
  if (
    /^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_/:{}-]+$/.test(trimmed) &&
    !/\.(png|jpe?g|gif|svg|webp|ico|css|scss|js|mjs|json|woff2?|ttf)$/i.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/**
 * Memeriksa apakah sebuah node berada di dalam deklarasi ObjectLiteral / Enum konfigurasi terstruktur
 * Contoh yang valid:
 * const API_ENDPOINTS = { USERS: { LIST: '/api/users' } } as const;
 */
function isInsideStructuredConfigObject(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  let insideObjectLiteral = false;

  while (current) {
    if (ts.isObjectLiteralExpression(current)) {
      insideObjectLiteral = true;
    }
    if (ts.isEnumDeclaration(current)) {
      return true;
    }
    // Jika berada di dalam argumen CallExpression (kecuali Object.freeze), berarti inline call
    if (ts.isCallExpression(current)) {
      const calleeText = current.expression.getText();
      if (calleeText !== 'Object.freeze') {
        return false;
      }
    }
    if (ts.isVariableDeclaration(current) && insideObjectLiteral) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Memeriksa apakah node berada di dalam konteks tipe TypeScript murni atau import/export module specifier
 */
function isNonRuntimeContext(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      ts.isImportDeclaration(current) ||
      ts.isExportDeclaration(current) ||
      ts.isTypeNode(current) ||
      ts.isInterfaceDeclaration(current) ||
      ts.isTypeAliasDeclaration(current) ||
      ts.isModuleDeclaration(current)
    ) {
      return true;
    }
    if (ts.isCallExpression(current) && current.expression.getText() === 'require') {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Menghitung Cyclomatic Complexity dari suatu fungsi/method
 */
function calculateCyclomaticComplexity(fnNode: ts.FunctionLikeDeclaration): number {
  let complexity = 1;

  const visitBody = (n: ts.Node) => {
    // Jangan hitung fungsi bersarang di dalam fungsi ini (dihitung terpisah)
    if (n !== fnNode && ts.isFunctionLike(n)) {
      return;
    }

    if (
      ts.isIfStatement(n) ||
      ts.isForStatement(n) ||
      ts.isForInStatement(n) ||
      ts.isForOfStatement(n) ||
      ts.isWhileStatement(n) ||
      ts.isDoStatement(n) ||
      ts.isCatchClause(n) ||
      ts.isConditionalExpression(n)
    ) {
      complexity++;
    } else if (ts.isCaseClause(n)) {
      complexity++;
    } else if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        complexity++;
      }
    }

    ts.forEachChild(n, visitBody);
  };

  if (fnNode.body) {
    visitBody(fnNode.body);
  }
  return complexity;
}

export class AgnosticSpeculativeScanner {
  private violations: AgnosticViolation[] = [];
  private activeCategories: Set<ScanCategory>;

  constructor(activeCategories: Set<ScanCategory> = new Set(['SPECULATIVE'])) {
    this.activeCategories = activeCategories;
  }

  private addViolation(
    sourceFile: ts.SourceFile,
    relativePath: string,
    node: ts.Node,
    severity: Severity,
    category: ScanCategory,
    pattern: string,
    message: string,
    recommendation: string
  ): void {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const snippet = formatSnippet(getCleanText(node, sourceFile));
    this.violations.push({
      file: relativePath,
      line: line + 1,
      column: character + 1,
      severity,
      category,
      pattern,
      message,
      snippet,
      recommendation
    });
  }

  public scanFile(filePath: string): void {
    const code = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      code,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    const visitedBinaryNodes = new Set<ts.Node>();
    const visitedOptionalChains = new Set<ts.Node>();

    // Kolektor untuk deteksi Magic String berulang di dalam satu file (Hardcoding Mode)
    const magicStringComparisons = new Map<string, ts.Node[]>();

    // Deteksi komentar compiler suppression (@ts-ignore / @ts-nocheck) pada Architecture Mode
    if (this.activeCategories.has('ARCHITECTURE')) {
      this.scanCompilerSuppressionComments(code, sourceFile, relativePath);
    }

    const visit = (node: ts.Node, controlFlowDepth: number) => {
      // =========================================================================
      // DIMENSI 1: SPECULATIVE & DEFENSIVE ARCHITECTURE
      // =========================================================================
      if (this.activeCategories.has('SPECULATIVE')) {
        this.checkSpeculativePatterns(
          node,
          sourceFile,
          relativePath,
          visitedBinaryNodes,
          visitedOptionalChains
        );
      }

      // =========================================================================
      // DIMENSI 2: HARDCODING & MAGIC LITERAL RECOGNITION
      // =========================================================================
      if (this.activeCategories.has('HARDCODING')) {
        this.checkHardcodingPatterns(node, sourceFile, relativePath, magicStringComparisons);
      }

      // =========================================================================
      // DIMENSI 3: SPAGHETTI CODE & CONTROL FLOW ENTROPY
      // =========================================================================
      let nextControlFlowDepth = controlFlowDepth;
      if (this. isControlFlowBlockNode(node)) {
        nextControlFlowDepth = controlFlowDepth + 1;
      }
      if (ts.isFunctionLike(node)) {
        // Reset perhitungan kedalaman control flow untuk scope fungsi baru
        nextControlFlowDepth = 0;
      }

      if (this.activeCategories.has('SPAGHETTI')) {
        this.checkSpaghettiPatterns(node, sourceFile, relativePath, nextControlFlowDepth);
      }

      // =========================================================================
      // DIMENSI 4: ARCHITECTURE & TYPE INTEGRITY
      // =========================================================================
      if (this.activeCategories.has('ARCHITECTURE')) {
        this.checkArchitecturePatterns(node, sourceFile, relativePath);
      }

      ts.forEachChild(node, (child) => visit(child, nextControlFlowDepth));
    };

    visit(sourceFile, 0);

    // Evaluasi akumulasi Magic String pada akhir pemindaian file
    if (this.activeCategories.has('HARDCODING')) {
      for (const [literalVal, nodes] of magicStringComparisons.entries()) {
        if (nodes.length >= 3) {
          const firstNode = nodes[0];
          const severity: Severity = nodes.length >= 5 ? 'HIGH' : 'MEDIUM';
          this.addViolation(
            sourceFile,
            relativePath,
            firstNode,
            severity,
            'HARDCODING',
            'REPEATED_MAGIC_STRING',
            `String literal '${literalVal}' digunakan berulang kali (${nodes.length}x) dalam perbandingan logika/percabangan.`,
            'Ekstrak string diskriminator/status ke dalam Object Constant terstruktur (as const) atau Enum kanonik.'
          );
        }
      }
    }
  }

  /**
   * ---------------------------------------------------------------------------
   * DETEKTOR DIMENSI 1: SPECULATIVE & DEFENSIVE PATTERNS
   * ---------------------------------------------------------------------------
   */
  private checkSpeculativePatterns(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    relativePath: string,
    visitedBinaryNodes: Set<ts.Node>,
    visitedOptionalChains: Set<ts.Node>
  ): void {
    // 1. Rantai Binary Expression (|| atau ??)
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      if (!visitedBinaryNodes.has(node)) {
        const opKind = node.operatorToken.kind;
        const chain = flattenBinaryTree(node, opKind);

        for (const item of chain) {
          let p = item.parent;
          while (p && p !== node.parent) {
            visitedBinaryNodes.add(p);
            p = p.parent;
          }
        }

        // POLA 1A: CASING_VARIANT_COMPARISON (x === 'foo' || x === 'FOO')
        const stringComparisons: { subject: string; literal: string }[] = [];
        for (const item of chain) {
          const cmp = extractEqualityStringComparison(item, sourceFile);
          if (cmp) stringComparisons.push(cmp);
        }

        if (stringComparisons.length >= 2) {
          const bySubject = new Map<string, string[]>();
          for (const { subject, literal } of stringComparisons) {
            const list = bySubject.get(subject) || [];
            list.push(literal);
            bySubject.set(subject, list);
          }

          for (const [subject, literals] of bySubject) {
            const seenLower = new Map<string, string>();
            let variantPair: [string, string] | null = null;

            for (const lit of literals) {
              const lower = lit.toLowerCase();
              const existing = seenLower.get(lower);
              if (existing && existing !== lit) {
                variantPair = [existing, lit];
                break;
              }
              seenLower.set(lower, lit);
            }

            if (variantPair) {
              this.addViolation(
                sourceFile,
                relativePath,
                node,
                'CRITICAL',
                'SPECULATIVE',
                'CASING_VARIANT_COMPARISON',
                `Spekulasi casing terdeteksi pada subjek "${subject}" dengan varian '${variantPair[0]}' dan '${variantPair[1]}'.`,
                'Hapus varian spekulatif string. Gunakan tipe kanonik atau objek konstanta tunggal dari source-of-truth.'
              );
            }
          }
        }

        // POLA 1B: PROPERTY_NAME_GUESSING (obj.a || obj.b || obj.c)
        const propAccesses: { receiver: string; property: string }[] = [];
        for (const item of chain) {
          const pa = extractPropertyAccess(item, sourceFile);
          if (pa && !DOM_KEYBOARD_MODIFIERS.has(pa.property)) {
            propAccesses.push(pa);
          }
        }

        if (propAccesses.length >= 2) {
          const byReceiver = new Map<string, Set<string>>();
          for (const { receiver, property } of propAccesses) {
            const set = byReceiver.get(receiver) || new Set<string>();
            set.add(property);
            byReceiver.set(receiver, set);
          }

          for (const [receiver, props] of byReceiver) {
            if (props.size === 2 && props.has('from') && props.has('to')) {
              continue;
            }
            if (props.size >= 2) {
              const propList = Array.from(props).join(', ');
              this.addViolation(
                sourceFile,
                relativePath,
                node,
                'CRITICAL',
                'SPECULATIVE',
                'PROPERTY_NAME_GUESSING',
                `Spekulasi properti alternatif terdeteksi pada objek "${receiver}" dengan field: [${propList}].`,
                'Tetapkan kontrak DTO/interface kanonik upstream.schema-based validation.zod Jangan menebak banyak nama properti alternatif pada objek yang sama.Kamu harus melihat di database asli, harus dynamic, scalable. Bagaimana kalau besok ada data baru? Bagaimana, hayo? Tetapkan, ini yang mana satu yang paling benar dari sini. Yang paling percaya foreign key, yang paling percaya upstream, gitu. Kalau kiranya ini adalah over-engineer, ya sesimpel kamu hapus, kamu sehatkan kodenya, kamu pecah kodenya. Saya nggak mau tahu, tidak boleh ada hard coding, magic string, dan tidak menggunakan layer yang bahkan sudah ada, gitu. Nah, harus ada ZOD-nya, harus ada layer exception-nya, harus ada. Ya kamu lihat aja, pasti udah ada ZOD. Tinggal kamu buatkan skemanya saja untuk bisa ngeproteksi supaya tidak hancur, gitu ya. Pokoknya tidak boleh ada fabricated, fabricated data, fallback mechanism, nggak boleh. Tidak boleh ada, baik itu coalescing atau pipe operation, nggak boleh ada. Pokoknya dia straightforward. Dia jujur, holy grail. Apa kata database, di-render aja. Dynamic, progressive, dynamic paradigm, dynamic programming. Skalabilitas tingkat tinggi. Besok kalau ada data baru bagaimana? Hayo? Nah, jadi kira-kira begitu. Redundancy nggak boleh. Empat pilar: redundancy, fallback, dan juga defensive itu tidak boleh ada. Kita mau ngedesain hal yang memang sewajarnya, gitu ya. Harus ada layer interceptor. Kan udah saya bilang, bahwasanya ada middleware dan harus ada schema validation biar supaya dia tidak khawatir, gitu loh. Ya udah pasti ada tipe data, harus jelas, nggak boleh any. Buatkan DTO-nya kalau memang belum ada. Entitas itu ya memang apa kata database itu yang di-entitaskan. Backend sesimpel, cuman representasi dari database. Dia itu adalah core, bukan urusan-urusan yang aneh-aneh terkait dengan... Pokoknya over-engineering itu tidak usah ada lagi, gitu ya.Keep it simple, keep it stupid.Agnostic independent.'
              );
            }
          }
        }

        // POLA 1C: DEEP_VALUE_FALLBACK_CHAIN (a || b || c)
        const isAllBooleanPredicates = chain.every(isBooleanPredicateNode);
        if (!isAllBooleanPredicates && chain.length >= 3) {
          const severity: Severity = chain.length >= 4 ? 'HIGH' : 'MEDIUM';
          this.addViolation(
            sourceFile,
            relativePath,
            node,
            severity,
            'SPECULATIVE',
            'DEEP_VALUE_FALLBACK_CHAIN',
            `Rantai fallback nilai bertingkat (${chain.length} operan). Berpotensi menyamarkan data hilang atau cacat kontrak.`,
            'Sederhanakan menjadi representasi kanonik tunggal. Pastikan layer batas (adapter/schema) menjamin ketersediaan nilai.'
          );
        }

        // POLA 1D: FABRICATED_FALLBACK_LITERAL (obj.time ?? '00:00' atau obj.status ?? 'UNKNOWN')
        // Mendeteksi koalesing fallback ke nilai literal buatan (jam fiktif, sentinel placeholder)
        for (let i = 0; i < chain.length - 1; i++) {
          const leftNode = chain[i];
          const rightNode = chain[i + 1];
          if (ts.isStringLiteral(rightNode) || ts.isNoSubstitutionTemplateLiteral(rightNode)) {
            const literalText = rightNode.text.trim();
            const pa = extractPropertyAccess(leftNode, sourceFile);
            if (pa && pa.receiver !== 'process.env') {
              const isTimeLiteral = /^\d{1,2}:\d{2}(:\d{2})?$/.test(literalText);
              const isSentinelPlaceholder =
                /^(unknown|n\/a|none|default|dummy|test|null|undefined)$/i.test(literalText);
              if (isTimeLiteral || isSentinelPlaceholder) {
                const reason = isTimeLiteral ? 'jam/waktu fiktif' : 'sentinel placeholder fiktif';
                this.addViolation(
                  sourceFile,
                  relativePath,
                  rightNode,
                  'HIGH',
                  'SPECULATIVE',
                  'FABRICATED_FALLBACK_LITERAL',
                  `Koalesing ke nilai ${reason} '${literalText}' pada properti "${pa.receiver}.${pa.property}". Menyamarkan data hilang atau korupsi state upstream.`,
                  'Hapus fallback fiktif. Biarkan nilai null/undefined atau perbaiki kontrak upstream agar nilai terjamin pasti.'
                );
              }
            }
          }
        }
      }
    }

    // 2. POLA 1D: REDUNDANT_ARRAY_CASING_INCLUSION (['foo', 'FOO'].includes(x))
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'includes' &&
      ts.isArrayLiteralExpression(node.expression.expression)
    ) {
      const arrayLit = node.expression.expression;
      const seenLower = new Map<string, string>();
      let variantPair: [string, string] | null = null;

      for (const el of arrayLit.elements) {
        if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
          const text = el.text;
          const lower = text.toLowerCase();
          const prev = seenLower.get(lower);
          if (prev && prev !== text) {
            variantPair = [prev, text];
            break;
          }
          seenLower.set(lower, text);
        }
      }

      if (variantPair) {
        this.addViolation(
          sourceFile,
          relativePath,
          node,
          'HIGH',
          'SPECULATIVE',
          'REDUNDANT_ARRAY_CASING_INCLUSION',
          `Array includes() memuat spekulasi varian casing '${variantPair[0]}' dan '${variantPair[1]}'.`,
          'Normalisasi input di boundary masuk atau gunakan konstanta enum tunggal tanpa menebak variasi huruf besar/kecil.'
        );
      }
    }

    // 3. POLA 1E: SPECULATIVE_OPTIONAL_CHAIN_DEPTH (a?.b?.c?.d)
    if (
      (ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node) ||
        ts.isCallExpression(node)) &&
      !visitedOptionalChains.has(node)
    ) {
      const depth = getOptionalChainDepth(node);
      if (depth >= 4) {
        let curr: ts.Node = node;
        while (
          ts.isPropertyAccessExpression(curr) ||
          ts.isElementAccessExpression(curr) ||
          ts.isCallExpression(curr)
        ) {
          visitedOptionalChains.add(curr);
          curr = curr.expression;
        }

        this.addViolation(
          sourceFile,
          relativePath,
          node,
          'MEDIUM',
          'SPECULATIVE',
          'SPECULATIVE_OPTIONAL_CHAIN_DEPTH',
          `Rantai optional chaining terlalu dalam (${depth} tingkat '?.' beruntun). Mengindikasikan struktur objek belum tervalidasi dan melanggar Law of Demeter.`,
          'Validasi struktur data pada boundary masuk (schema parser) agar properti bersarang memiliki jaminan tipe yang pasti.'
        );
      }
    }
  }

  /**
   * ---------------------------------------------------------------------------
   * DETEKTOR DIMENSI 2: HARDCODING & MAGIC LITERALS
   * ---------------------------------------------------------------------------
   */
  private checkHardcodingPatterns(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    relativePath: string,
    magicStringComparisons: Map<string, ts.Node[]>
  ): void {
    if (isNonRuntimeContext(node)) return;

    // 1. POLA 2A & 2B: HARDCODED_ENDPOINT_OR_URL & UNSTRUCTURED_FLAT_API_CONSTANT
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const val = node.text;
      if (isEndpointOrUrlString(val)) {
        const insideStructuredObj = isInsideStructuredConfigObject(node);
        if (!insideStructuredObj) {
          // Cek apakah dideklarasikan sebagai variabel flat: const USER_API = '/api/users'
          if (
            ts.isVariableDeclaration(node.parent) &&
            node.parent.initializer === node
          ) {
            this.addViolation(
              sourceFile,
              relativePath,
              node.parent,
              'MEDIUM',
              'HARDCODING',
              'UNSTRUCTURED_FLAT_API_CONSTANT',
              `Endpoint atau URL '${val}' dideklarasikan sebagai variabel primitif flat, bukan di dalam objek konfigurasi terstruktur.`,
              'Kelompokkan seluruh endpoint API ke dalam objek hierarkis (contoh: export const API_ENDPOINTS = { ... } as const).'
            );
          } else {
            this.addViolation(
              sourceFile,
              relativePath,
              node,
              'HIGH',
              'HARDCODING',
              'HARDCODED_ENDPOINT_OR_URL',
              `Hardcoded URL atau API endpoint '${val}' ditemukan langsung di dalam ekspresi kode.`,
              'Jangan melakukan hardcode path/URL secara inline. Gunakan referensi dari objek konfigurasi endpoint terpusat.'
            );
          }
        }
      }
    }

    // Cek juga TemplateExpression (contoh: `/api/v1/users/${userId}` atau `https://api.com/${path}`)
    if (ts.isTemplateExpression(node)) {
      const headText = node.head.text;
      if (isEndpointOrUrlString(headText)) {
        // Izinkan hanya jika berada di dalam method/arrow-function milik objek konfigurasi endpoint
        // Contoh valid: const API_ENDPOINTS = { USER_DETAIL: (id: string) => `/api/v1/users/${id}` } as const
        const isInsideConfigBuilderObject = isInsideStructuredConfigObject(node);
        if (!isInsideConfigBuilderObject) {
          this.addViolation(
            sourceFile,
            relativePath,
            node,
            'HIGH',
            'HARDCODING',
            'HARDCODED_ENDPOINT_OR_URL',
            `Template URL atau API endpoint dinamis '${headText}...' dirakit secara inline di luar objek konfigurasi.`,
            'Enkapsulasi pembuatan URL dinamis sebagai fungsi builder di dalam objek konfigurasi API (contoh: API_ENDPOINTS.USERS.DETAIL(id)).'
          );
        }
      }
    }

    // 2. POLA 2C: Koleksi REPEATED_MAGIC_STRING pada operasi perbandingan & switch-case
    if (ts.isBinaryExpression(node)) {
      const cmp = extractEqualityStringComparison(node, sourceFile, true);
      if (cmp) {
        const lit = cmp.literal.trim();
        // Abaikan empty string atau single-char separator, serta hasil typeof standar
        const isTypeofCheck = cmp.subject.startsWith('typeof ');
        if (lit.length >= 2 && !isTypeofCheck) {
          const list = magicStringComparisons.get(lit) || [];
          list.push(node);
          magicStringComparisons.set(lit, list);
        }
      }
    } else if (ts.isCaseClause(node)) {
      if (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression)) {
        const lit = node.expression.text.trim();
        if (lit.length >= 2) {
          const list = magicStringComparisons.get(lit) || [];
          list.push(node);
          magicStringComparisons.set(lit, list);
        }
      }
    }

    // 3. POLA 2D: MAGIC_NUMERIC_THRESHOLD
    if (ts.isNumericLiteral(node)) {
      const numVal = Number(node.text);
      if (!Number.isNaN(numVal) && !ALLOWED_MAGIC_NUMBERS.has(numVal)) {
        const parent = node.parent;
        // Laporkan jika angka dipakai langsung dalam perbandingan (<, >, <=, >=, ===) atau argumen timer
        const isComparison =
          ts.isBinaryExpression(parent) &&
          (parent.operatorToken.kind === ts.SyntaxKind.GreaterThanToken ||
            parent.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken ||
            parent.operatorToken.kind === ts.SyntaxKind.LessThanToken ||
            parent.operatorToken.kind === ts.SyntaxKind.LessThanEqualsToken ||
            parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
            parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken);

        if (isComparison && !isInsideStructuredConfigObject(node)) {
          this.addViolation(
            sourceFile,
            relativePath,
            parent,
            'MEDIUM',
            'HARDCODING',
            'MAGIC_NUMERIC_THRESHOLD',
            `Magic number (${node.text}) digunakan langsung dalam batas perbandingan logika tanpa nama konstanta yang jelas.`,
            'Simpan angka batas/threshold ke dalam konstanta bernama atau objek konfigurasi domain (contoh: LIMITS.MAX_RETRY_ATTEMPTS).'
          );
        }
      }
    }
  }

  /**
   * ---------------------------------------------------------------------------
   * DETEKTOR DIMENSI 3: SPAGHETTI CODE & CONTROL FLOW ENTROPY
   * ---------------------------------------------------------------------------
   */
  private isControlFlowBlockNode(node: ts.Node): boolean {
    if (ts.isIfStatement(node)) {
      // Jangan tambah kedalaman untuk `else if` beruntun (flat ladder)
      if (ts.isIfStatement(node.parent) && node.parent.elseStatement === node) {
        return false;
      }
      return true;
    }
    return (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isSwitchStatement(node) ||
      ts.isTryStatement(node)
    );
  }

  private checkSpaghettiPatterns(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    relativePath: string,
    controlFlowDepth: number
  ): void {
    // 1. POLA 3A: NESTED_TERNARY_ENTROPY (a ? b : c ? d : e)
    if (ts.isConditionalExpression(node)) {
      // Hanya laporkan pada root ConditionalExpression agar tidak duplikat
      if (!ts.isConditionalExpression(node.parent) && !ts.isParenthesizedExpression(node.parent)) {
        const hasNestedTernary =
          this.containsConditionalExpression(node.whenTrue) ||
          this.containsConditionalExpression(node.whenFalse);

        if (hasNestedTernary) {
          this.addViolation(
            sourceFile,
            relativePath,
            node,
            'HIGH',
            'SPAGHETTI',
            'NESTED_TERNARY_ENTROPY',
            'Ekspresi ternary bersarang (nested ternary) terdeteksi. Menurunkan keterbacaan dan menyulitkan pelacakan alur logika.',
            'Ubah menjadi blok early-return (guard clause), lookup map objek, atau fungsi helper terpisah.'
          );
        }
      }
    }

    // 2. POLA 3B: DEEP_CONTROL_FLOW_NESTING (Arrowhead Anti-Pattern >= 4 tingkat)
    if (this.isControlFlowBlockNode(node) && controlFlowDepth === 4) {
      this.addViolation(
        sourceFile,
        relativePath,
        node,
        'HIGH',
        'SPAGHETTI',
        'DEEP_CONTROL_FLOW_NESTING',
        `Percabangan/perulangan bersarang terlalu dalam (${controlFlowDepth} tingkat). Membentuk pola kode Arrowhead/Spaghetti.`,
        'Terapkan pola Guard Clauses (early return/continue) atau ekstrak blok terdalam menjadi fungsi yang terfokus.'
      );
    }

    // 3. POLA 3C & 3D: HIGH_CYCLOMATIC_COMPLEXITY & EXCESSIVE_PARAMETER_LIST pada fungsi
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      // Cek jumlah parameter posisional (> 4 parameter)
      if (node.parameters.length > 4) {
        this.addViolation(
          sourceFile,
          relativePath,
          node,
          'MEDIUM',
          'SPAGHETTI',
          'EXCESSIVE_PARAMETER_LIST',
          `Fungsi memiliki terlalu banyak parameter posisional (${node.parameters.length} parameter). Rentan terhadap kesalahan urutan argumen.`,
          'Gunakan satu parameter berbentuk objek terstruktur (Options/Params Object Pattern) dengan tipe eksplisit.'
        );
      }

      // Cek Cyclomatic Complexity
      const complexity = calculateCyclomaticComplexity(node);
      if (complexity > 12) {
        const severity: Severity = complexity > 20 ? 'CRITICAL' : 'HIGH';
        const fnName = this.resolveFunctionName(node);
        this.addViolation(
          sourceFile,
          relativePath,
          node,
          severity,
          'SPAGHETTI',
          'HIGH_CYCLOMATIC_COMPLEXITY',
          `Fungsi "${fnName}" memiliki Cyclomatic Complexity terlalu tinggi (${complexity} jalur percabangan).`,
          'Pecah fungsi menjadi beberapa fungsi komposabel yang lebih kecil atau gunakan Strategy/Handler Dictionary Object.'
        );
      }
    }
  }

  private containsConditionalExpression(node: ts.Node): boolean {
    let target = node;
    while (ts.isParenthesizedExpression(target)) {
      target = target.expression;
    }
    return ts.isConditionalExpression(target);
  }

  private resolveFunctionName(node: ts.FunctionLikeDeclaration): string {
    if (node.name && ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      return node.parent.name.text;
    }
    if (ts.isPropertyAssignment(node.parent) && ts.isIdentifier(node.parent.name)) {
      return node.parent.name.text;
    }
    return '<anonymous>';
  }

  /**
   * ---------------------------------------------------------------------------
   * DETEKTOR DIMENSI 4: ARCHITECTURE & TYPE INTEGRITY
   * ---------------------------------------------------------------------------
   */
  private checkArchitecturePatterns(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    relativePath: string
  ): void {
    // 1. POLA 4A: SWALLOWED_OR_EMPTY_CATCH
    if (ts.isCatchClause(node)) {
      const statements = node.block.statements;
      if (statements.length === 0) {
        this.addViolation(
          sourceFile,
          relativePath,
          node,
          'CRITICAL',
          'ARCHITECTURE',
          'SWALLOWED_OR_EMPTY_CATCH',
          'Blok catch kosong terdeteksi. Menelan exception secara diam-diam dan menyembunyikan kegagalan runtime.',
          'Tangani error secara eksplisit, teruskan ke error boundary/logger terstruktur, atau lempar kembali (rethrow) domain error.'
        );
      }
    }

    // 2. POLA 4B: TYPE_SAFETY_ESCAPE_HATCH (as any / as unknown as T)
    if (ts.isAsExpression(node)) {
      if (node.type.kind === ts.SyntaxKind.AnyKeyword) {
        this.addViolation(
          sourceFile,
          relativePath,
          node,
          'HIGH',
          'ARCHITECTURE',
          'TYPE_SAFETY_ESCAPE_HATCH',
          'Penggunaan type assertion `as any` terdeteksi. Mematikan pemeriksaan keamanan tipe statis.',
          'Definisikan type guard, generic constraint, atau interface yang presisi tanpa memotong kompas sistem tipe.'
        );
      } else if (
        ts.isAsExpression(node.expression) &&
        node.expression.type.kind === ts.SyntaxKind.UnknownKeyword
      ) {
        this.addViolation(
          sourceFile,
          relativePath,
          node,
          'HIGH',
          'ARCHITECTURE',
          'TYPE_SAFETY_ESCAPE_HATCH',
          'Double type assertion (`as unknown as T`) terdeteksi. Memaksa konversi tipe yang tidak kompatibel secara struktural.',
          'Gunakan fungsi mapper/adapter eksplisit atau runtime schema validator untuk mentransformasi tipe secara aman.'
        );
      }
    }

    // 3. POLA 4C: MUTABLE_EXPORTED_STATE (export let ...)
    if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const isLet = (node.declarationList.flags & ts.NodeFlags.Let) !== 0;
      if (isExported && isLet) {
        this.addViolation(
          sourceFile,
          relativePath,
          node,
          'HIGH',
          'ARCHITECTURE',
          'MUTABLE_EXPORTED_STATE',
          'Ekspor state mutable (`export let`) terdeteksi. Menciptakan shared mutable state lintas modul yang sulit dilacak.',
          'Gunakan `export const` dengan enkapsulasi state manager atau store yang memiliki kontrak mutasi terkontrol.'
        );
      }
    }

    // 4. POLA 4D: IMPURE_CONSOLE_ARTIFACT (console.log / console.debug)
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'console'
    ) {
      const method = node.expression.name.text;
      if (method === 'log' || method === 'debug' || method === 'dir') {
        this.addViolation(
          sourceFile,
          relativePath,
          node,
          'LOW',
          'ARCHITECTURE',
          'IMPURE_CONSOLE_ARTIFACT',
          `Pemanggilan \`console.${method}()\` tertinggal di dalam kode sumber.`,
          'Hapus log debugging sementara atau gunakan abstraksi logger terstruktur aplikasi.'
        );
      }
    }
  }

  private scanCompilerSuppressionComments(
    code: string,
    sourceFile: ts.SourceFile,
    relativePath: string
  ): void {
    const regex = /\/\/\s*@(ts-ignore|ts-nocheck)\b/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(code)) !== null) {
      const pos = match.index;
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
      const lineText = code.split(/\r?\n/)[line] || match[0];
      this.violations.push({
        file: relativePath,
        line: line + 1,
        column: character + 1,
        severity: 'HIGH',
        category: 'ARCHITECTURE',
        pattern: 'COMPILER_SUPPRESSION_DIRECTIVE',
        message: `Direktif penekan kompiler '@${match[1]}' membungkam pemeriksaan error TypeScript.`,
        snippet: formatSnippet(lineText),
        recommendation:
          'Perbaiki akar lihat ke database asli, kemudiaan sehatkan code nya, hapus overenginer, hapus hardcoded, pakai yang sudah ada, integrate with existing, split by func, ketidakcocokan tipe secara langsung alih-alih membungkam kompiler TypeScript.'
      });
    }
  }

  public scanPath(targetPath: string): void {
    if (!fs.existsSync(targetPath)) {
      return;
    }
    const stat = fs.statSync(targetPath);
    if (stat.isFile()) {
      if (/\.(ts|tsx)$/.test(targetPath) && !targetPath.endsWith('.d.ts')) {
        this.scanFile(targetPath);
      }
    } else if (stat.isDirectory()) {
      this.scanDirectory(targetPath);
    }
  }

  public scanDirectory(dir: string): void {
    if (!fs.existsSync(dir)) {
      return;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!DEFAULT_IGNORED_DIRS.has(entry.name)) {
          this.scanDirectory(fullPath);
        }
      } else if (entry.isFile()) {
        if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
          this.scanFile(fullPath);
        }
      }
    }
  }

  public getViolations(minSeverity: Severity = 'LOW'): AgnosticViolation[] {
    const minWeight = SEVERITY_WEIGHT[minSeverity];
    return this.violations.filter((v) => SEVERITY_WEIGHT[v.severity] >= minWeight);
  }
}

/**
 * Mengurai argumen mode CLI menjadi himpunan kategori aktif
 */
function parseModeArgument(rawMode: string): { categories: Set<ScanCategory>; label: string } {
  const parts = rawMode
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const categories = new Set<ScanCategory>();

  for (const part of parts) {
    if (part === 'omni' || part === 'all') {
      categories.add('SPECULATIVE');
      categories.add('HARDCODING');
      categories.add('SPAGHETTI');
      categories.add('ARCHITECTURE');
    } else if (part === 'default' || part === 'speculative') {
      categories.add('SPECULATIVE');
    } else if (part === 'hardcoding') {
      categories.add('HARDCODING');
    } else if (part === 'spaghetti') {
      categories.add('SPAGHETTI');
    } else if (part === 'architecture') {
      categories.add('ARCHITECTURE');
    }
  }

  if (categories.size === 0) {
    categories.add('SPECULATIVE');
  }

  const isOmni =
    categories.has('SPECULATIVE') &&
    categories.has('HARDCODING') &&
    categories.has('SPAGHETTI') &&
    categories.has('ARCHITECTURE');

  const label = isOmni ? 'OMNI (ALL DIMENSIONS)' : Array.from(categories).join(' + ');
  return { categories, label };
}

function printHelp(): void {
  console.log(`
OMNI AGNOSTIC AST ARCHITECTURE SCANNER
--------------------------------------------------------------------------------
Penggunaan:
  npx tsx check-speculative-patterns.ts [opsi]

Opsi Mode Pemindaian (Default: speculative):
  --mode=default        Hanya memindai pola spekulasi & fallback (Default)
  --mode=speculative    Alias untuk mode default
  --mode=hardcoding     Memindai hardcoded API/URL, flat endpoint, magic string/number
  --mode=spaghetti      Memindai nested ternary, deep nesting, cyclomatic complexity
  --mode=architecture   Memindai empty catch, as any / double cast, mutable export
  --mode=omni           Mengaktifkan seluruh detektor pada semua dimensi
  --omni                Flag cepat untuk mengaktifkan --mode=omni

  Catatan: Mode dapat digabungkan dengan koma, contoh:
  --mode=speculative,hardcoding

Opsi Filter & Output:
  --path=<dir>          Direktori target pemindaian (Default: ./src)
  --min=<SEVERITY>      Filter severity minimum: LOW | MEDIUM | HIGH | CRITICAL
  --fail-on=<SEVERITY>  Batas exit code 1: LOW | MEDIUM | HIGH | CRITICAL (Default: CRITICAL)
  --json                Cetak hasil dalam format JSON murni
  --help                Tampilkan panduan penggunaan ini
--------------------------------------------------------------------------------
`);
}

// CLI Runner
export function runCli(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  let rawMode = 'default';
  const options: ScannerConfig = {
    targetDir: path.resolve(process.cwd(), 'src'),
    minSeverity: 'LOW',
    failOn: 'CRITICAL',
    modes: new Set<ScanCategory>(['SPECULATIVE']),
    modeLabel: 'SPECULATIVE (DEFAULT)',
    json: false
  };

  for (const arg of args) {
    if (!arg.startsWith('-')) {
      options.targetDir = path.resolve(process.cwd(), arg);
    } else if (arg.startsWith('--path=')) {
      options.targetDir = path.resolve(process.cwd(), arg.split('=')[1]);
    } else if (arg.startsWith('--min=')) {
      options.minSeverity = arg.split('=')[1].toUpperCase() as Severity;
    } else if (arg.startsWith('--fail-on=')) {
      options.failOn = arg.split('=')[1].toUpperCase() as Severity;
    } else if (arg.startsWith('--mode=')) {
      rawMode = arg.split('=')[1];
    } else if (arg === '--omni') {
      rawMode = 'omni';
    } else if (arg === '--json') {
      options.json = true;
    }
  }

  const parsedMode = parseModeArgument(rawMode);
  options.modes = parsedMode.categories;
  options.modeLabel = parsedMode.label;

  const scanner = new AgnosticSpeculativeScanner(options.modes);
  scanner.scanPath(options.targetDir);

  const violations = scanner.getViolations(options.minSeverity);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          mode: options.modeLabel,
          targetDir: path.relative(process.cwd(), options.targetDir) || '.',
          totalViolations: violations.length,
          violations
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  console.log('\n[OMNI ARCHITECTURE SCANNER] Memulai analisis AST statis...');
  console.log(`Target Direktori : ${path.relative(process.cwd(), options.targetDir) || '.'}`);
  console.log(`Mode Aktif       : ${options.modeLabel}`);
  console.log(`Ambang Kegagalan : >= ${options.failOn}`);
  console.log('-'.repeat(88));

  const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const categoryCounts: Record<ScanCategory, number> = {
    SPECULATIVE: 0,
    HARDCODING: 0,
    SPAGHETTI: 0,
    ARCHITECTURE: 0
  };

  for (const v of violations) {
    counts[v.severity]++;
    categoryCounts[v.category]++;
  }

  if (violations.length === 0) {
    console.log('[PASS] Zero pelanggaran arsitektur terdeteksi pada mode yang dipilih.');
    console.log('-'.repeat(88) + '\n');
    process.exit(0);
  }

  const grouped = new Map<string, AgnosticViolation[]>();
  for (const v of violations) {
    const list = grouped.get(v.file) || [];
    list.push(v);
    grouped.set(v.file, list);
  }

  for (const [file, items] of grouped) {
    console.log(`\nFILE: \x1b[1m${file}\x1b[0m (${items.length} temuan)`);
    for (const v of items) {
      const sevBadge = SEVERITY_BADGES[v.severity];
      const catBadge = CATEGORY_BADGES[v.category];
      console.log(
        `  ${sevBadge} ${catBadge} Line ${v.line}:${v.column} - \x1b[1m[${v.pattern}]\x1b[0m ${v.message}`
      );
      console.log(`     \x1b[90mSnippet :\x1b[0m \x1b[31m${v.snippet}\x1b[0m`);
      console.log(`     \x1b[32mSolusi  :\x1b[0m ${v.recommendation}`);
    }
  }

  console.log('\n' + '='.repeat(88));
  console.log('RINGKASAN PEMERIKSAAN KESEHATAN ARSITEKTUR:');
  console.log(`  [CRITICAL] : ${counts.CRITICAL}`);
  console.log(`  [HIGH]     : ${counts.HIGH}`);
  console.log(`  [MEDIUM]   : ${counts.MEDIUM}`);
  console.log(`  [LOW]      : ${counts.LOW}`);
  console.log('-'.repeat(88));
  console.log('DISTRIBUSI KATEGORI:');
  console.log(`  SPECULATIVE  : ${categoryCounts.SPECULATIVE}`);
  console.log(`  HARDCODING   : ${categoryCounts.HARDCODING}`);
  console.log(`  SPAGHETTI    : ${categoryCounts.SPAGHETTI}`);
  console.log(`  ARCHITECTURE : ${categoryCounts.ARCHITECTURE}`);
  console.log(`  TOTAL TEMUAN : ${violations.length} pola terdeteksi`);
  console.log('='.repeat(88) + '\n');

  const failWeight = SEVERITY_WEIGHT[options.failOn];
  const hasFailingViolation = violations.some((v) => SEVERITY_WEIGHT[v.severity] >= failWeight);

  if (hasFailingViolation) {
    console.error(`[FAIL] Ditemukan pelanggaran dengan tingkat keparahan >= ${options.failOn}.\n`);
    process.exit(1);
  } else {
    console.log(`[PASS] Tidak ada pelanggaran setingkat atau di atas ${options.failOn}.\n`);
    process.exit(0);
  }
}

runCli();