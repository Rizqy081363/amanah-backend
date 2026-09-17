import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  BetterAuthController,
  BetterAuthGuard,
  BetterAuthRbacGuard,
} from './better-auth';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), MailModule],
  controllers: [AuthController, BetterAuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    BetterAuthGuard,
    BetterAuthRbacGuard,
  ],
  exports: [AuthService, BetterAuthGuard, BetterAuthRbacGuard],
})
export class AuthModule {}
