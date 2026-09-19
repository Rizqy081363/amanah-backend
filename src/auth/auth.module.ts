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
import { HybridAuthGuard } from '../common/auth/hybrid-auth.guard';
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
    HybridAuthGuard,
  ],
  exports: [AuthService, BetterAuthGuard, BetterAuthRbacGuard, HybridAuthGuard],
})
export class AuthModule {}
