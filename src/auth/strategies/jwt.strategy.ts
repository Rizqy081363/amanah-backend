import { ExtractJwt, Strategy } from 'passport-jwt';
import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { JwtPayloadType } from './types/jwt-payload.type';
import { AllConfigType } from '../../config/config.type';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import { users } from '../../database/schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<AllConfigType>,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow('auth.secret', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  public async validate(payload: JwtPayloadType) {
    if (!payload.id) {
      throw new UnauthorizedException();
    }

    const user = await this.db.query.users.findFirst({
      where: eq(users.id, Number(payload.id)),
      with: {
        staff: true,
        patient: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      ...payload,
      id: user.id,
      email: user.email,
      systemRole: user.systemRole,
      role: user.role,
      staff: user.staff,
      patient: user.patient,
    };
  }
}
