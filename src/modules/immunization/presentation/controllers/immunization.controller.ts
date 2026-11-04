import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  HybridAuthGuard,
  PermissionsGuard,
  RequirePermissions,
} from '../../../../common/auth';
import { CreateImmunizationIntakeUseCase } from '../../application/use-cases/create-immunization-intake.use-case';
import { GetChildImmunizationLedgerUseCase } from '../../application/use-cases/get-child-immunization-ledger.use-case';
import { GetImmunizationHistoryUseCase } from '../../application/use-cases/get-immunization-history.use-case';
import { UpdateImmunizationEntryUseCase } from '../../application/use-cases/update-immunization-entry.use-case';
import { CreateImmunizationIntakeDto } from '../dto/create-immunization-intake.dto';
import { ImmunizationHistoryQueryDto } from '../dto/immunization-query.dto';
import { SaveClinicalEntriesDto } from '../dto/save-clinical-entries.dto';
import { UpdateImmunizationIntakeDto } from '../dto/update-immunization-intake.dto';

@ApiTags('Immunization (Rekam Medis & Imunisasi Anak)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@Controller({ path: 'immunization', version: '1' })
export class ImmunizationController {
  constructor(
    private readonly createIntakeUseCase: CreateImmunizationIntakeUseCase,
    private readonly updateEntryUseCase: UpdateImmunizationEntryUseCase,
    private readonly getLedgerUseCase: GetChildImmunizationLedgerUseCase,
    private readonly getHistoryUseCase: GetImmunizationHistoryUseCase,
  ) {}

  @Post('intakes')
  @RequirePermissions('records:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit formulir pendaftaran imunisasi anak (Pasien/Booking)',
    description:
      'Hanya menyimpan data identitas anak, kontak orang tua, dan riwayat teks tanpa kuisioner klinis.',
  })
  @ApiCreatedResponse({ description: 'Pendaftaran imunisasi berhasil disimpan' })
  async createIntake(
    @Body() body: CreateImmunizationIntakeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createIntakeUseCase.execute(body, user?.id);
  }

  @Get('intakes/:id')
  @RequirePermissions('records:read')
  @ApiOperation({
    summary: 'Mendapatkan detail formulir imunisasi dan ledger 15 baris by ID',
  })
  @ApiParam({ name: 'id', description: 'ID intake atau submission' })
  async getIntakeById(@Param('id') id: string) {
    const intake = await this.getLedgerUseCase.executeByIntakeId(id);
    if (!intake) {
      throw new NotFoundException('Data rekam medis imunisasi tidak ditemukan');
    }
    return intake;
  }

  @Get('intakes/by-appointment/:appointmentId')
  @RequirePermissions('records:read')
  @ApiOperation({
    summary:
      'Mendapatkan data rekam medis imunisasi berdasarkan ID Kunjungan (Appointment)',
  })
  @ApiParam({ name: 'appointmentId', description: 'ID unik janji temu' })
  async getIntakeByAppointmentId(
    @Param('appointmentId') appointmentId: string,
  ) {
    const intake =
      await this.getLedgerUseCase.executeByAppointmentId(appointmentId);
    if (!intake) {
      throw new NotFoundException(
        'Data imunisasi untuk kunjungan ini tidak ditemukan',
      );
    }
    return intake;
  }

  @Patch('intakes/:id')
  @RequirePermissions('records:write')
  @ApiOperation({
    summary: 'Update formulir pendaftaran imunisasi by ID (Admin / Dokter / Bidan)',
  })
  async updateIntakeById(
    @Param('id') id: string,
    @Body() body: UpdateImmunizationIntakeDto,
  ) {
    const updated = await this.updateEntryUseCase.executeIntakeUpdate(id, body);
    if (body.entries && body.entries.length > 0 && updated.patientId) {
      await this.updateEntryUseCase.executeClinicalEntriesUpsert(
        updated.patientId,
        updated.id,
        body.entries,
        updated.appointmentId,
      );
    }
    return this.getLedgerUseCase.executeByIntakeId(id);
  }

  @Get('patient/:patientId/ledger')
  @RequirePermissions('records:read')
  @ApiOperation({
    summary:
      'Mendapatkan Buku Imunisasi Kumulatif 15 baris kanonikal milik anak',
  })
  @ApiParam({ name: 'patientId', description: 'ID profil pasien anak' })
  @ApiOkResponse({ description: 'Daftar 15 baris kumulatif imunisasi anak' })
  async getChildLedger(@Param('patientId') patientId: string) {
    return this.getLedgerUseCase.execute(patientId);
  }

  @Patch('patient/:patientId/entries')
  @RequirePermissions('records:write')
  @ApiOperation({
    summary:
      'Simpan / perbarui baris klinis imunisasi (BB, PB, LK, Suhu, Tgl Suntik, Demam, Batuk, Pilek)',
    description:
      'Dijalankan oleh dokter/bidan di klinik saat pemeriksaan fisik dan penyuntikan vaksin.',
  })
  async saveClinicalEntries(
    @Param('patientId') patientId: string,
    @Body() body: SaveClinicalEntriesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.updateEntryUseCase.executeClinicalEntriesUpsert(
      patientId,
      '',
      body.entries,
      body.appointmentId,
      user?.id,
    );
  }

  @Get('history')
  @RequirePermissions('records:read')
  @ApiOperation({
    summary: 'Mendapatkan riwayat registrasi dan rekam imunisasi anak (Paginasi)',
  })
  async getHistory(@Query() query: ImmunizationHistoryQueryDto) {
    return this.getHistoryUseCase.execute(query);
  }
}
