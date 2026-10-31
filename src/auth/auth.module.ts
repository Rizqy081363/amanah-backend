import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { HybridAuthGuard } from '../common/auth/hybrid-auth.guard';
import { MailModule } from '../mail/mail.module';
import { AvatarModule } from '../modules/avatar/avatar.module';
import { AccessControlModule } from '../modules/access-control/access-control.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { AuthAccountLifecycleService } from './application/services/auth-account-lifecycle.service';
import { AuthLoginService } from './application/services/auth-login.service';
import { AuthRegistrationOtpService } from './application/services/auth-registration-otp.service';
import { AuthStaffOnboardingService } from './application/services/auth-staff-onboarding.service';
import { IdentityEnrollmentService } from './application/services/identity-enrollment.service';
import { UserProvisionedNotificationPublisher } from './application/publishers/user-provisioned-notification.publisher';
import { UserProvisionedNotificationRules } from './infrastructure/notifications/user-provisioned.notifications';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  BetterAuthController,
  BetterAuthGuard,
} from './better-auth';
import { registerBetterAuthUserCreatedHook } from './better-auth/auth';
import { GoogleTokenVerifierService } from './services/google-token-verifier.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    MailModule,
    AvatarModule,
    AccessControlModule,
    NotificationsModule,
  ],
  controllers: [AuthController, BetterAuthController],
  providers: [
    AuthService,
    AuthLoginService,
    AuthRegistrationOtpService,
    AuthStaffOnboardingService,
    IdentityEnrollmentService,
    AuthAccountLifecycleService,
    GoogleTokenVerifierService,
    UserProvisionedNotificationPublisher,
    UserProvisionedNotificationRules,
    JwtStrategy,
    JwtRefreshStrategy,
    BetterAuthGuard,
    HybridAuthGuard,
  ],
  exports: [
    AuthService,
    AuthLoginService,
    AuthRegistrationOtpService,
    AuthStaffOnboardingService,
    IdentityEnrollmentService,
    AuthAccountLifecycleService,
    GoogleTokenVerifierService,
    UserProvisionedNotificationPublisher,
    BetterAuthGuard,
    HybridAuthGuard,
  ],
})
export class AuthModule implements OnModuleInit {
  constructor(
    private readonly publisher: UserProvisionedNotificationPublisher,
  ) {}

  onModuleInit(): void {
    registerBetterAuthUserCreatedHook((params) => {
      return this.publisher.publishUserProvisioned(params);
    });
  }
}
