import { DomainForbiddenException } from '@common/exceptions';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DeleteScheduleSessionUseCase {
  async execute(_id: string, _sessionId?: string): Promise<never> {
    throw new DomainForbiddenException(
      'Admin tidak diizinkan menghapus sesi jadwal dokter demi integritas data dan riwayat rekam medis klinis. Silakan nonaktifkan sesi dengan status CLOSED atau lakukan Reschedule.',
    );
  }
}
