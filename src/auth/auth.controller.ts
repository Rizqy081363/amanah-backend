import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Request,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { User } from '../users/domain/user';
import { RateLimit } from '../common/throttling';
import { NullableType } from '../utils/types/nullable.type';
import type { RequestWithUser } from '../utils/types/request-with-user.type';
import { AuthService } from './auth.service';
import { AuthConfirmEmailDto } from './dto/auth-confirm-email.dto';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthForgotPasswordDto } from './dto/auth-forgot-password.dto';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import {
  AuthResendOtpDto,
  ResendOtpResponseDto,
} from './dto/auth-resend-otp.dto';
import { AuthResendVerificationDto } from './dto/auth-resend-verification.dto';
import { AuthResetPasswordOtpDto } from './dto/auth-reset-password-otp.dto';
import { AuthResetPasswordDto } from './dto/auth-reset-password.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { AuthVerifyOtpDto } from './dto/auth-verify-otp.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshResponseDto } from './dto/refresh-response.dto';
import type { JwtPayloadType } from './strategies/types/jwt-payload.type';
import type { JwtRefreshPayloadType } from './strategies/types/jwt-refresh-payload.type';

@ApiTags('Auth (Kanonikal JWT)')
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @SerializeOptions({
    groups: ['me'],
  })
  @Post('email/login')
  @ApiOperation({
    summary: 'Login dengan email dan kata sandi',
    description:
      'Mengotentikasi kredensial pengguna dan mengembalikan JWT access token serta refresh token.',
  })
  @ApiOkResponse({
    type: LoginResponseDto,
    description: 'Autentikasi berhasil',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Email tidak ditemukan atau kata sandi tidak cocok',
  })
  @HttpCode(HttpStatus.OK)
  public login(@Body() loginDto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    return this.service.validateLogin(loginDto);
  }

  @Post('email/register')
  @ApiOperation({
    summary: 'Registrasi pengguna baru',
    description: 'Mendaftarkan akun baru dengan verifikasi email opsional.',
  })
  @ApiNoContentResponse({
    description: 'Pendaftaran berhasil',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi form registrasi gagal atau email telah terdaftar',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(@Body() createUserDto: AuthRegisterLoginDto): Promise<void> {
    return this.service.register(createUserDto);
  }

  @Post('email/confirm')
  @ApiOperation({
    summary: 'Konfirmasi alamat email',
    description:
      'Memverifikasi status kepemilikan email menggunakan hash token.',
  })
  @ApiNoContentResponse({
    description: 'Alamat email berhasil diverifikasi',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Token verifikasi tidak valid atau telah kedaluwarsa',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmEmail(
    @Body() confirmEmailDto: AuthConfirmEmailDto,
  ): Promise<void> {
    return this.service.confirmEmail(confirmEmailDto.hash);
  }

  @Post('email/confirm/new')
  @ApiOperation({
    summary: 'Konfirmasi perubahan email baru',
    description:
      'Mengonfirmasi penggantian alamat email menggunakan token verifikasi.',
  })
  @ApiNoContentResponse({
    description: 'Email baru berhasil dikonfirmasi',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Token verifikasi email baru tidak valid',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmNewEmail(
    @Body() confirmEmailDto: AuthConfirmEmailDto,
  ): Promise<void> {
    return this.service.confirmNewEmail(confirmEmailDto.hash);
  }

  @Post('forgot/password')
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @ApiOperation({
    summary: 'Permintaan pemulihan kata sandi',
    description:
      'Mengirimkan email instruksi pemulihan kata sandi dengan token reset yang aman via SMTP/Mailpit (anti-enumeration: selalu mengembalikan status 204).',
  })
  @ApiNoContentResponse({
    description:
      'Email pemulihan kata sandi berhasil dikirim jika alamat email terdaftar di sistem',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(
    @Body() forgotPasswordDto: AuthForgotPasswordDto,
  ): Promise<void> {
    return this.service.forgotPassword(forgotPasswordDto.email);
  }

  @Post('reset/password')
  @ApiOperation({
    summary: 'Reset kata sandi dengan token',
    description:
      'Membuat kata sandi baru menggunakan token reset yang diterima melalui email.',
  })
  @ApiNoContentResponse({
    description: 'Kata sandi berhasil diperbarui',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Token reset tidak valid atau kedaluwarsa',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() resetPasswordDto: AuthResetPasswordDto): Promise<void> {
    return this.service.resetPassword(
      resetPasswordDto.hash,
      resetPasswordDto.password,
    );
  }

  @Post('otp/resend')
  @RateLimit({ limit: 5, windowSeconds: 60 })
  @ApiOperation({
    summary: 'Kirim ulang kode OTP (Verifikasi Email atau Lupa Password)',
    description:
      'Mengirimkan ulang kode OTP 6-digit ke email pengguna dengan proteksi cooldown 60 detik dan batas frekuensi permintaan.',
  })
  @ApiOkResponse({
    type: ResendOtpResponseDto,
    description: 'Permintaan kirim ulang kode OTP berhasil diproses',
  })
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() dto: AuthResendOtpDto): Promise<ResendOtpResponseDto> {
    return this.service.resendOtp(dto);
  }

  @Post('email/resend-verification')
  @RateLimit({ limit: 5, windowSeconds: 60 })
  @ApiOperation({
    summary: 'Kirim ulang kode verifikasi email akun baru',
    description:
      'Alias khusus untuk mengirimkan ulang kode verifikasi OTP aktivasi akun email baru dengan proteksi cooldown.',
  })
  @ApiOkResponse({
    type: ResendOtpResponseDto,
    description: 'Kode verifikasi email baru berhasil dikirim',
  })
  @HttpCode(HttpStatus.OK)
  async resendEmailVerification(
    @Body() dto: AuthResendVerificationDto,
  ): Promise<ResendOtpResponseDto> {
    return this.service.resendOtp({
      email: dto.email,
      type: 'email-verification',
    });
  }

  @Post('email/verify-otp')
  @ApiOperation({
    summary: 'Verifikasi email dengan kode OTP 6-digit',
    description:
      'Mengaktifkan status verifikasi email akun menggunakan kode OTP numerik 6 digit.',
  })
  @ApiOkResponse({
    description: 'Email berhasil diverifikasi',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Kode OTP tidak valid atau telah kedaluwarsa',
  })
  @HttpCode(HttpStatus.OK)
  async verifyEmailOtp(
    @Body() dto: AuthVerifyOtpDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.service.verifyEmailOtp(dto);
  }

  @Post('otp/reset-password')
  @ApiOperation({
    summary: 'Reset kata sandi menggunakan kode OTP 6-digit',
    description:
      'Memperbarui kata sandi pengguna langsung menggunakan kode OTP 6-digit yang diterima via email.',
  })
  @ApiNoContentResponse({
    description: 'Kata sandi berhasil diperbarui dengan kode OTP',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Kode OTP tidak valid atau akun tidak ditemukan',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPasswordWithOtp(
    @Body() dto: AuthResetPasswordOtpDto,
  ): Promise<void> {
    return this.service.resetPasswordWithOtp(dto);
  }

  @ApiBearerAuth('access-token')
  @SerializeOptions({
    groups: ['me'],
  })
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Mendapatkan data profil pengguna saat ini',
    description:
      'Mengembalikan informasi akun pengguna yang sedang login berdasarkan JWT bearer token.',
  })
  @ApiOkResponse({
    type: User,
    description: 'Data profil berhasil diambil',
  })
  @ApiUnauthorizedResponse({
    description: 'Sesi tidak valid atau token tidak disertakan',
  })
  @HttpCode(HttpStatus.OK)
  public me(
    @Request() request: RequestWithUser<JwtPayloadType>,
  ): Promise<NullableType<User>> {
    return this.service.me(request.user);
  }

  @ApiBearerAuth('access-token')
  @SerializeOptions({
    groups: ['me'],
  })
  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiOperation({
    summary: 'Pembaruan JWT access token',
    description:
      'Menghasilkan access token baru dengan menggunakan valid refresh token.',
  })
  @ApiOkResponse({
    type: RefreshResponseDto,
    description: 'Pembaruan token berhasil',
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token tidak valid atau kedaluwarsa',
  })
  @HttpCode(HttpStatus.OK)
  public refresh(
    @Request() request: RequestWithUser<JwtRefreshPayloadType>,
  ): Promise<RefreshResponseDto> {
    return this.service.refreshToken({
      sessionId: request.user.sessionId,
      hash: request.user.hash,
    });
  }

  @ApiBearerAuth('access-token')
  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Logout pengguna',
    description: 'Membatalkan sesi token saat ini.',
  })
  @ApiNoContentResponse({
    description: 'Logout berhasil',
  })
  @ApiUnauthorizedResponse({
    description: 'Sesi tidak valid',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  public async logout(
    @Request() request: RequestWithUser<JwtPayloadType>,
  ): Promise<void> {
    await this.service.logout({
      sessionId: request.user.sessionId,
    });
  }

  @ApiBearerAuth('access-token')
  @SerializeOptions({
    groups: ['me'],
  })
  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Memperbarui profil diri sendiri',
    description:
      'Memperbarui data nama, email, atau password pengguna yang sedang terautentikasi.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: User,
    description: 'Profil berhasil diperbarui',
  })
  @ApiUnauthorizedResponse({
    description: 'Sesi tidak valid',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Data pembaruan tidak valid',
  })
  public update(
    @Request() request: RequestWithUser<JwtPayloadType>,
    @Body() userDto: AuthUpdateDto,
  ): Promise<NullableType<User>> {
    return this.service.update(request.user, userDto);
  }

  @ApiBearerAuth('access-token')
  @Delete('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Hapus akun sendiri (Soft delete)',
    description: 'Menonaktifkan akun pengguna yang sedang login.',
  })
  @ApiNoContentResponse({
    description: 'Akun berhasil dinonaktifkan',
  })
  @ApiUnauthorizedResponse({
    description: 'Sesi tidak valid',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  public async delete(
    @Request() request: RequestWithUser<JwtPayloadType>,
  ): Promise<void> {
    return this.service.softDelete(request.user);
  }
}
