import { forwardRef, Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PatientsModule } from '../patients/patients.module';
import { CreateImmunizationIntakeUseCase } from './application/use-cases/create-immunization-intake.use-case';
import { GetChildImmunizationLedgerUseCase } from './application/use-cases/get-child-immunization-ledger.use-case';
import { GetImmunizationHistoryUseCase } from './application/use-cases/get-immunization-history.use-case';
import { UpdateImmunizationEntryUseCase } from './application/use-cases/update-immunization-entry.use-case';
import { IMMUNIZATION_REPOSITORY } from './domain/repositories/immunization.repository.interface';
import { ImmunizationDrizzleRepository } from './infrastructure/drizzle/immunization.drizzle-repository';
import { ImmunizationController } from './presentation/controllers/immunization.controller';

@Module({
  imports: [PatientsModule, forwardRef(() => AppointmentsModule)],
  controllers: [ImmunizationController],
  providers: [
    CreateImmunizationIntakeUseCase,
    UpdateImmunizationEntryUseCase,
    GetChildImmunizationLedgerUseCase,
    GetImmunizationHistoryUseCase,
    ImmunizationDrizzleRepository,
    {
      provide: IMMUNIZATION_REPOSITORY,
      useClass: ImmunizationDrizzleRepository,
    },
  ],
  exports: [
    IMMUNIZATION_REPOSITORY,
    ImmunizationDrizzleRepository,
    CreateImmunizationIntakeUseCase,
    UpdateImmunizationEntryUseCase,
    GetChildImmunizationLedgerUseCase,
    GetImmunizationHistoryUseCase,
  ],
})
export class ImmunizationModule {}
