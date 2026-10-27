export interface OriginPolicy {
  readonly exact: readonly string[];
  readonly patterns: readonly string[];
}

/**
 * Memeriksa apakah suatu origin cocok dengan pola wildcard (misal: https://*.devtunnels.ms).
 */
function matchesOriginPattern(origin: string, pattern: string): boolean {
  if (pattern === origin) return true;
  if (!pattern.includes('*')) return false;

  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*');

  const regex = new RegExp(`^${escaped}$`, 'i');
  return regex.test(origin);
}

/**
 * Single Source of Truth pembangun kebijakan origin untuk CORS, Better Auth, dan WebSocket.
 */
export function buildOriginPolicy(cfg: {
  appEnv: string;
  publicUrl?: string;
  extraOrigins?: string[];
  devPatterns?: string[];
}): OriginPolicy {
  const isProd = cfg.appEnv === 'production';
  const devPatterns = (cfg.devPatterns || []).filter(Boolean);
  const rawOrigins = [
    cfg.publicUrl,
    ...(cfg.extraOrigins || []),
  ].filter((o): o is string => Boolean(o && o.trim()));

  if (isProd && (devPatterns.length > 0 || rawOrigins.includes('*'))) {
    throw new Error(
      '[Security Invariant Violation] Wildcard/dev origin patterns are strictly forbidden when NODE_ENV=production.',
    );
  }

  const exactSet = new Set<string>();
  for (const raw of rawOrigins) {
    if (raw === '*') {
      if (!isProd) {
        exactSet.add('*');
      }
      continue;
    }
    try {
      const url = new URL(raw);
      exactSet.add(url.origin);
    } catch {
      // Abaikan URL yang tidak valid
    }
  }

  return {
    exact: Array.from(exactSet),
    patterns: isProd ? [] : devPatterns,
  };
}

/**
 * Predikat penguji apakah sebuah origin diizinkan mengakses resource backend.
 */
export function isOriginAllowed(
  origin: string | undefined | null,
  policy: OriginPolicy,
): boolean {
  // Request non-browser (misal: server-to-server, curl, native mobile Flutter) tidak menyertakan origin header
  if (!origin) return true;

  if (policy.exact.includes('*')) return true;
  if (policy.exact.includes(origin)) return true;

  return policy.patterns.some((pattern) => matchesOriginPattern(origin, pattern));
}
