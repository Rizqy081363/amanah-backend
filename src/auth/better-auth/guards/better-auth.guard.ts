import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { auth } from '../auth';

@Injectable()
export class BetterAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session || !session.user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (session.user.banned) {
      throw new UnauthorizedException(
        session.user.banReason || 'Account is banned',
      );
    }

    (request as any).user = session.user;
    (request as any).session = session.session;

    return true;
  }
}
