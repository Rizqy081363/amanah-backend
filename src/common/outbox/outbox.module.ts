import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from '../../database/drizzle/drizzle.module';
import { OutboxController } from './outbox.controller';
import { OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox.worker';

@Global()
@Module({
  imports: [DrizzleModule, ConfigModule],
  controllers: [OutboxController],
  providers: [OutboxService, OutboxWorker],
  exports: [OutboxService, OutboxWorker],
})
export class OutboxModule {}
