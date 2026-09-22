import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateCredentialDto {
  @ApiPropertyOptional({
    enum: ['sip', 'str', 'kki', 'npwp', 'nib', 'national_id', 'other'],
    example: 'sip',
  })
  @IsEnum(['sip', 'str', 'kki', 'npwp', 'nib', 'national_id', 'other'])
  @IsOptional()
  credentialType?:
    | 'sip'
    | 'str'
    | 'kki'
    | 'npwp'
    | 'nib'
    | 'national_id'
    | 'other';

  @ApiPropertyOptional({ example: '446/123/SIP-D/DPMPTSP/2024' })
  @IsString()
  @IsOptional()
  credentialNumber?: string;

  @ApiPropertyOptional({ example: 'Dinas Kesehatan Kota Bandung' })
  @IsString()
  @IsOptional()
  issuer?: string;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsString()
  @IsOptional()
  issuedAt?: string;

  @ApiPropertyOptional({ example: '2029-01-01' })
  @IsString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional({
    enum: ['unverified', 'verified', 'expired', 'revoked'],
    example: 'verified',
  })
  @IsEnum(['unverified', 'verified', 'expired', 'revoked'])
  @IsOptional()
  status?: 'unverified' | 'verified' | 'expired' | 'revoked';
}
