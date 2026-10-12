import { ApiProperty } from '@nestjs/swagger';

export class QueueNavigationDoctorDto {
  @ApiProperty({ description: 'ID praktisi / dokter (UUID)' })
  id: string;

  @ApiProperty({ description: 'Nama lengkap dokter' })
  name: string;

  @ApiProperty({ description: 'Spesialisasi dokter', nullable: true })
  specialty: string | null;

  @ApiProperty({ description: 'URL avatar dokter', nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ description: 'Total antrean janji temu yang ditugaskan kepada dokter' })
  totalAppointments: number;

  @ApiProperty({ description: 'Jumlah antrean aktif (menunggu + sedang dilayani)' })
  activeQueues: number;

  @ApiProperty({ description: 'Jumlah pasien status menunggu atau booked' })
  waitingCount: number;

  @ApiProperty({ description: 'Jumlah pasien status sedang dilayani' })
  inServiceCount: number;

  @ApiProperty({ description: 'Jumlah pasien status selesai' })
  completedCount: number;
}

export class QueueNavigationUnitDto {
  @ApiProperty({ description: 'ID unit klinik / poliklinik (UUID)' })
  id: string;

  @ApiProperty({ description: 'Kode unik unit (contoh: poli_umum)' })
  code: string;

  @ApiProperty({ description: 'Nama unit klinik (contoh: Poli Umum)' })
  name: string;

  @ApiProperty({ description: 'Prefix nomor antrean tiket (contoh: UM)', nullable: true })
  queuePrefix: string | null;

  @ApiProperty({ description: 'Total janji temu di unit ini pada tanggal terkait' })
  totalAppointments: number;

  @ApiProperty({ description: 'Total antrean aktif di unit ini' })
  activeQueues: number;

  @ApiProperty({ description: 'Jumlah janji temu yang belum ditugaskan ke dokter' })
  unassignedCount: number;

  @ApiProperty({
    description: 'Daftar dokter yang bertugas di unit ini beserta metrik antreannya',
    type: [QueueNavigationDoctorDto],
  })
  doctors: QueueNavigationDoctorDto[];
}

export class QueueNavigationResponseDto {
  @ApiProperty({ description: 'Tanggal operasional antrean (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ description: 'Sesi operasional yang difilter jika ada', nullable: true })
  session: string | null;

  @ApiProperty({
    description: 'Daftar kategori / unit klinik dengan struktur hierarki dokter',
    type: [QueueNavigationUnitDto],
  })
  units: QueueNavigationUnitDto[];
}
