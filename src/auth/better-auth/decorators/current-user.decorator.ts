import { createParamDecorator, ExecutionContext } from '@nestjs/common';

const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data && user ? user[data] : user;
  },
);

const CurrentSession = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const session = request.session;
    return data && session ? session[data] : session;
  },
);
