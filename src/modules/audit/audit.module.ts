import { Module } from '@nestjs/common';
import { AuditService } from './application/audit.service';
import { AUDIT_LOG_REPOSITORY } from './domain/repositories/audit-log.repository';
import { AuditLogDrizzleRepository } from './infrastructure/drizzle/audit-log.drizzle-repository';
import { AuditEventListener } from './infrastructure/listeners/audit-event.listener';
import { AuditController } from './presentation/audit.controller';

@Module({
  controllers: [AuditController],
  providers: [
    {
      provide: AUDIT_LOG_REPOSITORY,
      useClass: AuditLogDrizzleRepository,
    },
    AuditService,
    AuditEventListener,
  ],
  exports: [AuditService, AUDIT_LOG_REPOSITORY],
})
export class AuditModule {}
