import { Module } from '@nestjs/common';
import databaseConfig from '../database/config/database.config';
import { DatabaseConfig } from '../database/config/database-config.type';
import { DocumentSessionPersistenceModule } from './infrastructure/persistence/document/document-persistence.module';
import { DrizzleSessionPersistenceModule } from './infrastructure/persistence/drizzle/drizzle-persistence.module';
import { SessionService } from './session.service';

const infrastructurePersistenceModule = (databaseConfig() as DatabaseConfig)
  .isDocumentDatabase
  ? DocumentSessionPersistenceModule
  : DrizzleSessionPersistenceModule;

@Module({
  imports: [infrastructurePersistenceModule],
  providers: [SessionService],
  exports: [SessionService, infrastructurePersistenceModule],
})
export class SessionModule {}
