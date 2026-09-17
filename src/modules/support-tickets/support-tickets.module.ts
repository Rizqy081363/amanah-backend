import { Module } from '@nestjs/common';
import { DrizzleModule } from '../../database/drizzle/drizzle.module';
import { SUPPORT_TICKET_REPOSITORY } from './domain/repositories/support-ticket.repository';
import { SupportTicketDrizzleRepository } from './infrastructure/drizzle/support-ticket.drizzle-repository';
import { SupportTicketsController } from './presentation/support-tickets.controller';

@Module({
  imports: [DrizzleModule],
  controllers: [SupportTicketsController],
  providers: [
    {
      provide: SUPPORT_TICKET_REPOSITORY,
      useClass: SupportTicketDrizzleRepository,
    },
  ],
  exports: [SUPPORT_TICKET_REPOSITORY],
})
export class SupportTicketsModule {}
