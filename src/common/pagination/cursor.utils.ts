import { BadRequestException } from '@nestjs/common';

export interface CursorPayload {
  t: string; // ISO 8601 string for createdAt
  id: string; // Unique identifier for tiebreaking
}

/**
 * Encodes keyset attributes (createdAt, id) into an opaque base64url cursor (API-089, ARC-081).
 */
export function encodeCursor(payload: {
  createdAt: Date | string | number;
  id: string;
}): string {
  const dateObj =
    payload.createdAt instanceof Date
      ? payload.createdAt
      : new Date(payload.createdAt);

  if (Number.isNaN(dateObj.getTime())) {
    throw new BadRequestException(
      'Cannot encode cursor: invalid createdAt timestamp',
    );
  }

  const data: CursorPayload = {
    t: dateObj.toISOString(),
    id: String(payload.id),
  };

  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
}

/**
 * Decodes an opaque base64url cursor into keyset values (API-089).
 * Throws a 400 Bad Request exception if the cursor is malformed or tampered.
 */
export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  if (!cursor || typeof cursor !== 'string') {
    throw new BadRequestException(
      'Invalid pagination cursor: cursor must be a non-empty string',
    );
  }

  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || !parsed.t || !parsed.id) {
      throw new Error('Missing required cursor fields');
    }

    const createdAt = new Date(parsed.t);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('Invalid cursor timestamp');
    }

    return {
      createdAt,
      id: String(parsed.id),
    };
  } catch {
    throw new BadRequestException(
      'Invalid pagination cursor: malformed or tampered token',
    );
  }
}
