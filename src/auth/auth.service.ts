import { Injectable } from '@nestjs/common';
import { AuthAccountLifecycleService } from './application/services/auth-account-lifecycle.service';
import { AuthLoginService } from './application/services/auth-login.service';
import { AuthRegistrationOtpService } from './application/services/auth-registration-otp.service';
import { AuthStaffOnboardingService } from './application/services/auth-staff-onboarding.service';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthGoogleLoginDto } from './dto/auth-google-login.dto';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import {
  AuthResendOtpDto,
  ResendOtpResponseDto,
} from './dto/auth-resend-otp.dto';
import { AuthResetPasswordOtpDto } from './dto/auth-reset-password-otp.dto';
import { AuthStaffOnboardingDto } from './dto/auth-staff-onboarding.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { AuthVerifyOtpDto } from './dto/auth-verify-otp.dto';
import { DeleteAccountResponseDto } from './dto/delete-account-response.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshResponseDto } from './dto/refresh-response.dto';
import type { JwtPayloadType } from './strategies/types/jwt-payload.type';

/**
 * AuthService Facade
 * Provides a unified, backward-compatible API delegating to focused sub-services:
 * - AuthLoginService: Authentication, Google OAuth, tokens & logout
 * - AuthRegistrationOtpService: Registration, email verification & password recovery
 * - AuthStaffOnboardingService: Clinical staff onboarding & profile setup
 * - AuthAccountLifecycleService: Profile retrieval, updates & systemic purge
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly loginService: AuthLoginService,
    private readonly registrationOtpService: AuthRegistrationOtpService,
    private readonly staffOnboardingService: AuthStaffOnboardingService,
    private readonly accountLifecycleService: AuthAccountLifecycleService,
  ) {}

  public validateLogin(loginDto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    return this.loginService.validateLogin(loginDto);
  }

  public validateGoogleLogin(
    dto: AuthGoogleLoginDto,
  ): Promise<LoginResponseDto> {
    return this.loginService.validateGoogleLogin(dto);
  }

  public register(dto: AuthRegisterLoginDto): Promise<void> {
    return this.registrationOtpService.register(dto);
  }

  public confirmEmail(hash: string): Promise<void> {
    return this.registrationOtpService.confirmEmail(hash);
  }

  public confirmNewEmail(hash: string): Promise<void> {
    return this.registrationOtpService.confirmNewEmail(hash);
  }

  public forgotPassword(email: string): Promise<void> {
    return this.registrationOtpService.forgotPassword(email);
  }

  public resetPassword(hash: string, password: string): Promise<void> {
    return this.registrationOtpService.resetPassword(hash, password);
  }

  public resendOtp(dto: AuthResendOtpDto): Promise<ResendOtpResponseDto> {
    return this.registrationOtpService.resendOtp(dto);
  }

  public verifyEmailOtp(
    dto: AuthVerifyOtpDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.registrationOtpService.verifyEmailOtp(dto);
  }

  public resetPasswordWithOtp(dto: AuthResetPasswordOtpDto): Promise<void> {
    return this.registrationOtpService.resetPasswordWithOtp(dto);
  }

  public completeStaffOnboarding(
    userPayload: JwtPayloadType,
    dto: AuthStaffOnboardingDto,
  ): Promise<any> {
    return this.staffOnboardingService.completeStaffOnboarding(userPayload, dto);
  }

  public me(userPayload: any): Promise<any> {
    return this.accountLifecycleService.me(userPayload);
  }

  public update(
    userPayload: JwtPayloadType,
    userDto: AuthUpdateDto,
  ): Promise<any> {
    return this.accountLifecycleService.update(userPayload, userDto);
  }

  public refreshToken(data: {
    sessionId: string | number;
    hash?: string;
  }): Promise<RefreshResponseDto> {
    return this.loginService.refreshToken(data);
  }

  public softDelete(userPayload: JwtPayloadType): Promise<void> {
    return this.accountLifecycleService.softDelete(userPayload);
  }

  public purgeAccount(
    userPayload: JwtPayloadType,
  ): Promise<DeleteAccountResponseDto> {
    return this.accountLifecycleService.purgeAccount(userPayload);
  }

  public logout(data: {
    sessionId?: string;
    userId?: string;
    token?: string;
  }): Promise<void> {
    return this.loginService.logout(data);
  }
}
