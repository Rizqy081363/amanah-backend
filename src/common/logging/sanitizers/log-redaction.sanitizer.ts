import {
  DEFAULT_MAX_LOG_BODY_LENGTH,
  SENSITIVE_HEADER_NAMES,
  SENSITIVE_KEY_PATTERNS,
} from '../logging.constants';

const REDACTED_VALUE = '[REDACTED]';
const BINARY_BODY_OMITTED = '[BINARY_BODY_OMITTED]';

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.trim().toLowerCase();
  if (SENSITIVE_HEADER_NAMES.has(normalizedKey)) {
    return true;
  }
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isBufferOrBinary(value: unknown): boolean {
  if (!value) return false;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return true;
  }
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return true;
  }
  return false;
}

interface MulterFileLike {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
}

function isMulterFile(value: unknown): value is MulterFileLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as any).fieldname === 'string' &&
    typeof (value as any).originalname === 'string' &&
    typeof (value as any).mimetype === 'string' &&
    typeof (value as any).size === 'number'
  );
}

export function sanitizeHeaders(
  headers: Record<string, any> | undefined,
): Record<string, any> {
  if (!headers || typeof headers !== 'object') {
    return {};
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (isSensitiveKey(lowerKey)) {
      result[key] = REDACTED_VALUE;
    } else {
      result[key] = value;
    }
  }

  return result;
}

export function sanitizePayload(
  payload: unknown,
  options: {
    maxDepth?: number;
    maxLength?: number;
  } = {},
): unknown {
  const maxDepth = options.maxDepth ?? 32;
  const maxLength = options.maxLength ?? DEFAULT_MAX_LOG_BODY_LENGTH;
  const seen = new WeakSet<object>();

  function traverse(
    current: unknown,
    depth: number,
    isParentSensitive = false,
  ): unknown {
    if (current === null || current === undefined) {
      return current;
    }

    if (isBufferOrBinary(current)) {
      const len = (current as any).length ?? (current as any).byteLength ?? 0;
      return {
        _binaryOmitted: true,
        type: BINARY_BODY_OMITTED,
        byteLength: len,
      };
    }

    if (isMulterFile(current)) {
      return {
        field: current.fieldname,
        filename: current.originalname,
        mimeType: current.mimetype,
        size: current.size,
      };
    }

    if (typeof current === 'string') {
      if (isParentSensitive) {
        return REDACTED_VALUE;
      }
      if (current.length > maxLength) {
        return {
          _truncated: true,
          _originalSize: current.length,
          _loggedSize: maxLength,
          preview: `${current.slice(0, maxLength)}... [TRUNCATED]`,
        };
      }
      return current;
    }

    if (
      typeof current === 'number' ||
      typeof current === 'boolean' ||
      typeof current === 'symbol'
    ) {
      if (isParentSensitive) {
        return REDACTED_VALUE;
      }
      return current;
    }

    if (typeof current === 'bigint') {
      if (isParentSensitive) {
        return REDACTED_VALUE;
      }
      return current.toString();
    }

    if (typeof current === 'function') {
      return '[Function]';
    }

    if (depth >= maxDepth) {
      return '[MAX_DEPTH_REACHED]';
    }

    if (typeof current === 'object') {
      if (seen.has(current)) {
        return '[CIRCULAR_REFERENCE]';
      }
      seen.add(current);

      if (Array.isArray(current)) {
        return current.map((item) =>
          traverse(item, depth + 1, isParentSensitive),
        );
      }

      if (current instanceof Error) {
        return {
          name: current.name,
          message: current.message,
          stack: current.stack,
        };
      }

      if (current instanceof Date) {
        return current.toISOString();
      }

      const sanitizedObj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(current)) {
        const keyIsSensitive = isSensitiveKey(key);
        if (keyIsSensitive) {
          if (
            val !== null &&
            typeof val === 'object' &&
            !isBufferOrBinary(val) &&
            !isMulterFile(val)
          ) {
            sanitizedObj[key] = traverse(val, depth + 1, true);
          } else {
            sanitizedObj[key] = REDACTED_VALUE;
          }
        } else {
          sanitizedObj[key] = traverse(val, depth + 1, false);
        }
      }

      return sanitizedObj;
    }

    return String(current);
  }

  return traverse(payload, 0);
}
