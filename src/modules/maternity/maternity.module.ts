import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { CreateMaternityIntakeUseCase } from './application/use-cases/create-maternity-intake.use-case';
import { GetMaternityHistoryUseCase } from './application/use-cases/get-maternity-history.use-case';
import { GetMaternityIntakeUseCase } from './application/use-cases/get-maternity-intake.use-case';
import { UpdateMaternityIntakeUseCase } from './application/use-cases/update-maternity-intake.use-case';
import { MATERNITY_REPOSITORY } from './domain/repositories/maternity.repository.interface';
import { ObstetricCalculatorService } from './domain/services/obstetric-calculator.service';
import { MaternityDrizzleRepository } from './infrastructure/drizzle/maternity.drizzle-repository';
import { MaternityController } from './presentation/controllers/maternity.controller';

@Module({
  imports: [PatientsModule],
  controllers: [MaternityController],
  providers: [
    ObstetricCalculatorService,
    MaternityDrizzleRepository,
    {
      provide: MATERNITY_REPOSITORY,
      useExisting: MaternityDrizzleRepository,
    },
    CreateMaternityIntakeUseCase,
    UpdateMaternityIntakeUseCase,
    GetMaternityIntakeUseCase,
    GetMaternityHistoryUseCase,
  ],
  exports: [
    MATERNITY_REPOSITORY,
    MaternityDrizzleRepository,
    ObstetricCalculatorService,
    CreateMaternityIntakeUseCase,
    UpdateMaternityIntakeUseCase,
    GetMaternityIntakeUseCase,
    GetMaternityHistoryUseCase,
  ],
})
export class MaternityModule {}
