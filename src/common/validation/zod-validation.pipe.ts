import {
  type ArgumentMetadata,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';
import { DomainValidationException } from '../exceptions/domain.exceptions';
import type { InvalidParam } from '../filters/problem-details.filter';

@Injectable()
export class ZodValidationPipe<T = any> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, metadata: ArgumentMetadata): T {
    // Only validate request body, query parameters, or route params
    if (
      metadata.type !== 'body' &&
      metadata.type !== 'query' &&
      metadata.type !== 'param'
    ) {
      return value as T;
    }

    const result = this.schema.safeParse(value);

    if (!result.success) {
      const error = result.error;
      const invalidParams: InvalidParam[] = error.issues.map((issue) => {
        const path = issue.path.filter((p) => p !== '').join('.');
        return {
          name: path || (metadata.data ? metadata.data : 'payload'),
          reason: issue.message,
          code: issue.code,
        };
      });

      throw new DomainValidationException(
        'Validasi data masukan gagal.',
        invalidParams,
        {
          schemaErrorCount: error.issues.length,
        },
      );
    }

    return result.data as T;
  }
}

/**
 * Convenience helper to instantiate a ZodValidationPipe for a given schema.
 */
export function zodPipe<T = any>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
