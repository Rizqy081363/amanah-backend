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

export class CreateChildImmunizationIntakeDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ example: 'Rayyan Al-Fatih' })
  @IsString()
  @IsNotEmpty()
  childName: string;

  @ApiProperty({ example: '3201234567890003' })
  @IsString()
  @Length(16, 16)
  childNik: string;

  @ApiProperty({ example: '2025-06-15' })
  @IsDateString()
  @IsNotEmpty()
  childBirthDate: string;

  @ApiProperty({ enum: ['Laki-laki', 'Perempuan'], example: 'Laki-laki' })
  @IsIn(['Laki-laki', 'Perempuan'])
  @IsNotEmpty()
  childSex: 'Laki-laki' | 'Perempuan';

  @ApiPropertyOptional({ example: '1 tahun 3 bulan' })
  @IsString()
  @IsOptional()
  childAgeFormatted?: string;

  @ApiProperty({ example: '081234567890' })
  @IsString()
  @IsNotEmpty()
  parentPhone: string;

  @ApiPropertyOptional({ example: 'Ahmad Fauzi' })
  @IsString()
  @IsOptional()
  fatherName?: string;

  @ApiPropertyOptional({ example: 'Siti Aminah' })
  @IsString()
  @IsOptional()
  motherName?: string;

  @ApiPropertyOptional({ example: 'Jl. Anyelir 1 No. 243, Condongcatur' })
  @IsString()
  @IsOptional()
  childAddress?: string;

  @ApiProperty({
    example:
      'HB 0 sudah setelah lahir, BCG dan Polio 1 saat usia 1 bulan, DPT-HB-Hib 1-3 lengkap',
  })
  @IsString()
  @IsNotEmpty()
  previousVaccineHistory: string;

  @ApiPropertyOptional({
    example: 'Tidak ada riwayat alergi obat atau makanan',
  })
  @IsString()
  @IsOptional()
  childAllergyHistory?: string;
}
