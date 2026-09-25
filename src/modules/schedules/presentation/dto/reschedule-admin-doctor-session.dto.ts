import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class RescheduleAdminDoctorSessionDto {
  @ApiProperty({
    description:
      'Tanggal target baru untuk jadwal yang di-reschedule (format: YYYY-MM-DD)',
    example: '2026-10-15',
  })
  @IsNotEmpty({ message: 'targetDate wajib diisi' })
  @IsDateString({}, { message: 'targetDate harus berformat YYYY-MM-DD' })
  targetDate: string;

  @ApiProperty({
    description: 'Jam mulai target baru pada tanggal baru (format: HH:mm)',
    example: '09:00',
  })
  @IsNotEmpty({ message: 'targetStartTime wajib diisi' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'targetStartTime harus berformat HH:mm (00:00 - 23:59)',
  })
  targetStartTime: string;

  @ApiPropertyOptional({
    description:
      'Jam selesai target baru pada tanggal baru (opsional, format: HH:mm). Jika tidak diisi, backend menghitung otomatis dari durasi sesi.',
    example: '15:00',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'targetEndTime harus berformat HH:mm (00:00 - 23:59)',
  })
  targetEndTime?: string;

  @ApiPropertyOptional({
    description:
      'ID konteks shift target baru (morning, afternoon, night, early_morning). Jika tidak diisi, backend mendeteksi otomatis dari targetStartTime.',
    example: 'morning',
  })
  @IsOptional()
  @IsString()
  targetScheduleContextId?: string;

  @ApiPropertyOptional({
    description:
      'ID ruangan praktik target jika dokter dipindahkan ke ruangan lain',
    example: 'e3067341-a185-484d-91d6-84848fcff1ef',
  })
  @IsOptional()
  @IsUUID('4', { message: 'targetRoomId harus berformat UUID v4' })
  targetRoomId?: string;

  @ApiPropertyOptional({
    description:
      'Catatan pembaruan sesi / alasan reschedule (opsional, disimpan ke kolom `notes` di database)',
    example: 'Dokter dialihkan ke sesi siang',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Alias untuk `notes` (opsional untuk backward-compatibility jika frontend mengirim `reason`)',
    example: 'Dokter dialihkan ke sesi siang',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Apakah janji temu pasien aktif yang terikat pada sesi ini otomatis ikut di-reschedule ke tanggal baru',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  rescheduleActiveAppointments?: boolean;
}
