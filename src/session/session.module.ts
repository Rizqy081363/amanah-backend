import { Module } from '@nestjs/common';
import { DrizzleSessionPersistenceModule } from './infrastructure/persistence/drizzle/drizzle-persistence.module';
import { SessionService } from './session.service';

@Module({
  imports: [DrizzleSessionPersistenceModule],
  providers: [SessionService],
  exports: [SessionService, DrizzleSessionPersistenceModule],
})
export class SessionModule {}
