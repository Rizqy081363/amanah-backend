import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { DrizzleUserPersistenceModule } from './infrastructure/persistence/drizzle/drizzle-persistence.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [DrizzleUserPersistenceModule, FilesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, DrizzleUserPersistenceModule],
})
export class UsersModule {}
