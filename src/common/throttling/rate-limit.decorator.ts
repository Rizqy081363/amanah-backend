import { SetMetadata } from '@nestjs/common';
import type { RateLimitOptions } from '../constants/rate-limit.constants';

export const RATE_LIMIT_METADATA_KEY = 'RATE_LIMIT_METADATA_KEY';

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, options);
