import { Module } from '@nestjs/common';
import { REPLACEMENT_REPOSITORY } from './domain/repositories/replacement.repository';
import { ReplacementDrizzleRepository } from './infrastructure/drizzle/replacement.drizzle-repository';
import { ReplacementsController } from './presentation/replacements.controller';

@Module({
  controllers: [ReplacementsController],
  providers: [
    {
      provide: REPLACEMENT_REPOSITORY,
      useClass: ReplacementDrizzleRepository,
    },
  ],
  exports: [REPLACEMENT_REPOSITORY],
})
export class ReplacementsModule {}
