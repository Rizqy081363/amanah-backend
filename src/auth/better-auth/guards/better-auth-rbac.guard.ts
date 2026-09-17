import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  BETTER_AUTH_PERMISSION_KEY,
  BETTER_AUTH_ROLES_KEY,
  type RequiredPermission,
} from '../decorators/rbac.decorator';
import { hasRolePermission, type RoleName } from '../permissions';

@Injectable()
export class BetterAuthRbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(
      BETTER_AUTH_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredPermission =
      this.reflector.getAllAndOverride<RequiredPermission>(
        BETTER_AUTH_PERMISSION_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!requiredRoles && !requiredPermission) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('User context not available');
    }

    const userRole = user.role as RoleName | undefined;

    if (requiredRoles && requiredRoles.length > 0) {
      if (!userRole || !requiredRoles.includes(userRole)) {
        throw new ForbiddenException(
          `Insufficient permissions: requires one of [${requiredRoles.join(', ')}]`,
        );
      }
    }

    if (requiredPermission) {
      const allowed = hasRolePermission(
        userRole,
        requiredPermission.resource,
        requiredPermission.action,
      );
      if (!allowed) {
        throw new ForbiddenException(
          `Insufficient permissions: requires ${requiredPermission.resource}:${requiredPermission.action}`,
        );
      }
    }

    return true;
  }
}
