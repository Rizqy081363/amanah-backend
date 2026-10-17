import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterDevicePushDto {
  @ApiProperty({
    description: 'FCM Push Token dari perangkat mobile',
    example: 'dK9xYz...',
  })
  @IsString()
  @IsNotEmpty()
  pushToken!: string;

  @ApiProperty({
    description: 'Platform perangkat',
    enum: ['android', 'ios', 'web'],
    example: 'android',
  })
  @IsIn(['android', 'ios', 'web'])
  platform!: 'android' | 'ios' | 'web';

  @ApiPropertyOptional({
    description: 'Identifier unik hardware perangkat',
    example: 'android-id-98172',
  })
  @IsOptional()
  @IsString()
  deviceIdentifier?: string;

  @ApiPropertyOptional({
    description: 'Nama model perangkat',
    example: 'Samsung Galaxy S23',
  })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({
    description: 'Versi aplikasi',
    example: '1.0.0',
  })
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional({
    description: 'Versi OS',
    example: 'Android 14',
  })
  @IsOptional()
  @IsString()
  osVersion?: string;
}

export class UnregisterDevicePushDto {
  @ApiProperty({
    description: 'FCM Push Token yang ingin dinonaktifkan',
  })
  @IsString()
  @IsNotEmpty()
  pushToken!: string;
}
