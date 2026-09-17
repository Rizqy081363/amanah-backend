import { Module } from '@nestjs/common';
import databaseConfig from '../database/config/database.config';
import { DatabaseConfig } from '../database/config/database-config.type';
import { FilesModule } from '../files/files.module';
import { DocumentUserPersistenceModule } from './infrastructure/persistence/document/document-persistence.module';
import { DrizzleUserPersistenceModule } from './infrastructure/persistence/drizzle/drizzle-persistence.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const infrastructurePersistenceModule = (databaseConfig() as DatabaseConfig)
  .isDocumentDatabase
  ? DocumentUserPersistenceModule
  : DrizzleUserPersistenceModule;

@Module({
  imports: [infrastructurePersistenceModule, FilesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, infrastructurePersistenceModule],
})
export class UsersModule {}
