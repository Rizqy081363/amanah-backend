import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChildImmunizationEntryResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  intakeId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  patientId: string;

  @ApiProperty({ example: 'HB_0' })
  vaccineCode: string;

  @ApiProperty({ example: 'GIVEN' })
  status: string;

  @ApiPropertyOptional({ example: '2026-03-01' })
  givenDate?: string | null;

  @ApiPropertyOptional({ example: '2026-03' })
  givenMonth?: string | null;

  @ApiPropertyOptional({ example: 2 })
  ageEstimateMonths?: number | null;

  @ApiPropertyOptional({ example: 'EXACT' })
  datePrecision?: string | null;

  @ApiPropertyOptional()
  reviewReasons?: any;

  @ApiPropertyOptional()
  notes?: string | null;

  @ApiProperty({ example: '2026-10-01T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-10-01T10:00:00.000Z' })
  updatedAt: string;
}

export class ChildImmunizationResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  intakeSubmissionId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  patientId: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440003' })
  appointmentId?: string | null;

  @ApiProperty({ example: 'Rayyan Al-Fatih' })
  childName: string;

  @ApiProperty({ example: '3201234567890003' })
  childNik: string;

  @ApiProperty({ example: '2025-06-15' })
  childBirthDate: string;

  @ApiProperty({ example: 'Laki-laki' })
  childSex: string;

  @ApiPropertyOptional({ example: '1 tahun 3 bulan' })
  childAgeFormatted?: string | null;

  @ApiProperty({ example: '081234567890' })
  parentPhone: string;

  @ApiPropertyOptional({ example: 'Ahmad Fauzi' })
  fatherName?: string | null;

  @ApiPropertyOptional({ example: 'Siti Aminah' })
  motherName?: string | null;

  @ApiPropertyOptional({ example: 'Jl. Anyelir 1 No. 243, Condongcatur' })
  childAddress?: string | null;

  @ApiPropertyOptional({ example: 'HB 0, BCG, Polio 1-4, DPT-HB-Hib 1-3' })
  previousVaccineHistory?: string | null;

  @ApiPropertyOptional({ example: 'Tidak ada' })
  childAllergyHistory?: string | null;

  @ApiPropertyOptional({ type: [ChildImmunizationEntryResponseDto] })
  entries?: ChildImmunizationEntryResponseDto[];

  @ApiPropertyOptional()
  answers?: Record<string, any>;

  @ApiPropertyOptional()
  automatic?: Record<string, any>;

  @ApiProperty({ example: '2026-10-01T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-10-01T10:00:00.000Z' })
  updatedAt: string;
}
