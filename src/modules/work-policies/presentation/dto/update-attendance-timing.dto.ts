import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateAttendanceTimingDto {
  @ApiProperty({
    example: 30,
    description:
      'Batas durasi kerja minimal (menit) agar kehadiran staf diperhitungkan dalam pembayaran upah/payroll',
  })
  @IsInt()
  @Min(0)
  @Max(240)
  minBillableShiftMinutes: number;

  @ApiProperty({
    example: 15,
    description:
      'Faktor pembulatan durasi kerja ke interval menit terdekat untuk standardisasi payroll',
  })
  @IsInt()
  @Min(1)
  @Max(60)
  roundingIncrementMinutes: number;
}
