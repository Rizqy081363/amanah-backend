/**
 * Generates a deterministic string version identifier from an entity's updatedAt timestamp.
 */
export function generateEntityVersion(
  timestamp: Date | string | number | undefined | null,
): string {
  if (!timestamp) {
    return '1';
  }
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const time = date.getTime();
  return Number.isNaN(time) ? '1' : time.toString();
}

/**
 * Normalizes an ETag or If-Match header value by stripping quotes and weak entity prefixes (W/).
 */
export function normalizeVersion(val: string | undefined | null): string {
  if (!val) {
    return '';
  }
  let cleaned = val.trim();
  if (cleaned.startsWith('W/') || cleaned.startsWith('w/')) {
    cleaned = cleaned.slice(2).trim();
  }
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).trim();
  } else if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

/**
 * Formats a version identifier as a standard HTTP ETag header value.
 */
export function formatETag(version: string, weak = true): string {
  const normalized = normalizeVersion(version);
  return weak ? `W/"${normalized}"` : `"${normalized}"`;
}

/**
 * Checks if a client-supplied If-Match value matches the current entity version.
 * Supports:
 * - Wildcard '*' (matches any existing resource per RFC 9110)
 * - Exact string matching (e.g. '1726618200000')
 * - Weak entity tags (e.g. 'W/"1726618200000"')
 * - Quoted strings (e.g. '"1726618200000"')
 * - ISO timestamp format (e.g. '2026-09-18T01:00:00.000Z')
 */
export function matchesVersion(
  ifMatchHeader: string | undefined | null,
  currentVersion: string,
  currentUpdatedAt?: Date | string | null,
): boolean {
  if (!ifMatchHeader) {
    return false;
  }

  const trimmed = ifMatchHeader.trim();
  if (trimmed === '*') {
    return true;
  }

  // Comma-separated list of ETags (e.g. "v1", "v2")
  const candidates = trimmed.split(',').map((s) => normalizeVersion(s));
  const normalizedCurrent = normalizeVersion(currentVersion);

  if (candidates.includes(normalizedCurrent)) {
    return true;
  }

  // Check against epoch comparison if candidate is timestamp/ISO string
  if (currentUpdatedAt) {
    const currentEpoch = new Date(currentUpdatedAt).getTime();
    for (const candidate of candidates) {
      const parsedCandidateTime = new Date(candidate).getTime();
      if (
        !Number.isNaN(parsedCandidateTime) &&
        parsedCandidateTime === currentEpoch
      ) {
        return true;
      }
      if (candidate === currentEpoch.toString()) {
        return true;
      }
    }
  }

  return false;
}
