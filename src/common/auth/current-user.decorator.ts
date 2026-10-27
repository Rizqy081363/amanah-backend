import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from './authenticated-user.interface';

export const CurrentUser = createParamDecorator(
  <K extends keyof AuthenticatedUser | undefined = undefined>(
    data: K,
    ctx: ExecutionContext,
  ): K extends keyof AuthenticatedUser ? AuthenticatedUser[K] : AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;
    return (data ? user?.[data] : user) as any;
  },
);
