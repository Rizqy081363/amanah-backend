import {
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import { RedisService } from '../redis/redis.service';
import { HybridAuthGuard } from './hybrid-auth.guard';

@Injectable()
export class OptionalHybridAuthGuard extends HybridAuthGuard {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    db: DrizzleDatabase,
    @Optional() redisService?: RedisService,
    @Optional() reflector?: Reflector,
  ) {
    super(db, redisService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch {
      const request = context.switchToHttp().getRequest<Request>();
      (request as any).user = null;
      return true;
    }
  }

  handleRequest<TUser = any>(err: any, user: any): TUser {
    if (err || !user) {
      return null as any;
    }
    return user;
  }
}
