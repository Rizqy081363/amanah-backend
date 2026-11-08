import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { gender, type Gender } from '../../../../database/schema';

export class CreateImmunizationIntakeDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'ID profil pasien anak',
  })
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID janji temu (appointment), jika booking terjadwal',
  })
  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @ApiPropertyOptional({ example: 'Aisyah Putri Ramadhani' })
  @IsString()
  @IsOptional()
  childName?: string;

  @ApiPropertyOptional({ example: '3404075201260002' })
  @IsString()
  @Length(16, 16)
  @IsOptional()
  childNik?: string;

  @ApiPropertyOptional({ example: '2026-01-12' })
  @IsDateString()
  @IsOptional()
  childBirthDate?: string;

  @ApiPropertyOptional({
    enum: gender.enumValues,
    example: 'female',
  })
  @IsIn(gender.enumValues)
  @IsOptional()
  childSex?: Gender;

  @ApiPropertyOptional({ example: '1 bln' })
  @IsString()
  @IsOptional()
  childAgeFormatted?: string;

  @ApiPropertyOptional({ example: '081234567890' })
  @IsString()
  @IsOptional()
  parentPhone?: string;

  @ApiPropertyOptional({ example: 'Ahmad Fauzi' })
  @IsString()
  @IsOptional()
  fatherName?: string;

  @ApiPropertyOptional({ example: 'Dewi Lestari' })
  @IsString()
  @IsOptional()
  motherName?: string;

  @ApiPropertyOptional({
    example: 'Jl. Anyelir I No. 243, Condongcatur, Sleman',
  })
  @IsString()
  @IsOptional()
  childAddress?: string;

  @ApiPropertyOptional({ example: 'Jl. Anyelir I No. 243' })
  @IsString()
  @IsOptional()
  line1?: string;

  @ApiPropertyOptional({ example: '34' })
  @IsString()
  @IsOptional()
  provinceCode?: string;

  @ApiPropertyOptional({ example: 'DI YOGYAKARTA' })
  @IsString()
  @IsOptional()
  provinceName?: string;

  @ApiPropertyOptional({ example: '3404' })
  @IsString()
  @IsOptional()
  regencyCode?: string;

  @ApiPropertyOptional({ example: 'KABUPATEN SLEMAN' })
  @IsString()
  @IsOptional()
  regencyName?: string;

  @ApiPropertyOptional({ example: '340407' })
  @IsString()
  @IsOptional()
  districtCode?: string;

  @ApiPropertyOptional({ example: 'DEPOK' })
  @IsString()
  @IsOptional()
  districtName?: string;

  @ApiPropertyOptional({ example: '3404072001' })
  @IsString()
  @IsOptional()
  villageCode?: string;

  @ApiPropertyOptional({ example: 'CONDONGCATUR' })
  @IsString()
  @IsOptional()
  villageName?: string;

  @ApiPropertyOptional({
    example: 'HB 0 sudah diberikan setelah lahir di RS bersalin',
    description: 'Riwayat vaksin sebelumnya berupa teks bebas',
  })
  @IsString()
  @IsOptional()
  previousVaccineHistory?: string;

  @ApiPropertyOptional({
    example: 'Tidak ada alergi obat atau makanan yang diketahui',
    description: 'Riwayat alergi anak berupa teks bebas',
  })
  @IsString()
  @IsOptional()
  childAllergyHistory?: string;
}
