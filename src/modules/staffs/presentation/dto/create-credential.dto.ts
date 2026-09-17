import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCredentialDto {
  @ApiProperty({
    enum: ['sip', 'str', 'kki', 'npwp', 'nib', 'national_id', 'other'],
    example: 'sip',
  })
  @IsEnum(['sip', 'str', 'kki', 'npwp', 'nib', 'national_id', 'other'])
  @IsNotEmpty()
  credentialType:
    | 'sip'
    | 'str'
    | 'kki'
    | 'npwp'
    | 'nib'
    | 'national_id'
    | 'other';

  @ApiProperty({ example: '446/123/SIP-D/DPMPTSP/2024' })
  @IsString()
  @IsNotEmpty()
  credentialNumber: string;

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
}
