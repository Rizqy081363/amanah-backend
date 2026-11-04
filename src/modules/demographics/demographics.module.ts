import { Module } from '@nestjs/common';

// Blood Types
import { BLOOD_TYPE_REPOSITORY } from './blood-types/domain/repositories/blood-type.repository.interface';
import { BloodTypeDrizzleRepository } from './blood-types/infrastructure/drizzle/blood-type.drizzle-repository';
import { GetAllBloodTypesUseCase } from './blood-types/domain/use-cases/get-all-blood-types.use-case';
import { CreateBloodTypeUseCase } from './blood-types/domain/use-cases/create-blood-type.use-case';
import { UpdateBloodTypeUseCase } from './blood-types/domain/use-cases/update-blood-type.use-case';
import { DeleteBloodTypeUseCase } from './blood-types/domain/use-cases/delete-blood-type.use-case';
import { BloodTypesAdminController } from './blood-types/presentation/blood-types.controller';

// Education Levels
import { EDUCATION_LEVEL_REPOSITORY } from './education-levels/domain/repositories/education-level.repository.interface';
import { EducationLevelDrizzleRepository } from './education-levels/infrastructure/drizzle/education-level.drizzle-repository';
import { GetAllEducationLevelsUseCase } from './education-levels/domain/use-cases/get-all-education-levels.use-case';
import { CreateEducationLevelUseCase } from './education-levels/domain/use-cases/create-education-level.use-case';
import { UpdateEducationLevelUseCase } from './education-levels/domain/use-cases/update-education-level.use-case';
import { DeleteEducationLevelUseCase } from './education-levels/domain/use-cases/delete-education-level.use-case';
import { EducationLevelsAdminController } from './education-levels/presentation/education-levels.controller';

// Religions
import { RELIGION_REPOSITORY } from './religions/domain/repositories/religion.repository.interface';
import { ReligionDrizzleRepository } from './religions/infrastructure/drizzle/religion.drizzle-repository';
import { GetAllReligionsUseCase } from './religions/domain/use-cases/get-all-religions.use-case';
import { CreateReligionUseCase } from './religions/domain/use-cases/create-religion.use-case';
import { UpdateReligionUseCase } from './religions/domain/use-cases/update-religion.use-case';
import { DeleteReligionUseCase } from './religions/domain/use-cases/delete-religion.use-case';
import { ReligionsAdminController } from './religions/presentation/religions.controller';

// Occupations
import { OCCUPATION_REPOSITORY } from './occupations/domain/repositories/occupation.repository.interface';
import { OccupationDrizzleRepository } from './occupations/infrastructure/drizzle/occupation.drizzle-repository';
import { GetAllOccupationsUseCase } from './occupations/domain/use-cases/get-all-occupations.use-case';
import { CreateOccupationUseCase } from './occupations/domain/use-cases/create-occupation.use-case';
import { UpdateOccupationUseCase } from './occupations/domain/use-cases/update-occupation.use-case';
import { DeleteOccupationUseCase } from './occupations/domain/use-cases/delete-occupation.use-case';
import { OccupationsAdminController } from './occupations/presentation/occupations.controller';

@Module({
  controllers: [
    BloodTypesAdminController,
    EducationLevelsAdminController,
    ReligionsAdminController,
    OccupationsAdminController,
  ],
  providers: [
    // Repositories
    {
      provide: BLOOD_TYPE_REPOSITORY,
      useClass: BloodTypeDrizzleRepository,
    },
    {
      provide: EDUCATION_LEVEL_REPOSITORY,
      useClass: EducationLevelDrizzleRepository,
    },
    {
      provide: RELIGION_REPOSITORY,
      useClass: ReligionDrizzleRepository,
    },
    {
      provide: OCCUPATION_REPOSITORY,
      useClass: OccupationDrizzleRepository,
    },

    // Use cases: Blood Types
    GetAllBloodTypesUseCase,
    CreateBloodTypeUseCase,
    UpdateBloodTypeUseCase,
    DeleteBloodTypeUseCase,

    // Use cases: Education Levels
    GetAllEducationLevelsUseCase,
    CreateEducationLevelUseCase,
    UpdateEducationLevelUseCase,
    DeleteEducationLevelUseCase,

    // Use cases: Religions
    GetAllReligionsUseCase,
    CreateReligionUseCase,
    UpdateReligionUseCase,
    DeleteReligionUseCase,

    // Use cases: Occupations
    GetAllOccupationsUseCase,
    CreateOccupationUseCase,
    UpdateOccupationUseCase,
    DeleteOccupationUseCase,
  ],
  exports: [
    BLOOD_TYPE_REPOSITORY,
    EDUCATION_LEVEL_REPOSITORY,
    RELIGION_REPOSITORY,
    OCCUPATION_REPOSITORY,
    GetAllBloodTypesUseCase,
    GetAllEducationLevelsUseCase,
    GetAllReligionsUseCase,
    GetAllOccupationsUseCase,
  ],
})
export class DemographicsModule {}
