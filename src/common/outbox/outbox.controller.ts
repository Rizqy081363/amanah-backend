import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OutboxService } from './outbox.service';
import { OutboxMetrics, OutboxProcessResult } from './outbox.types';
import { OutboxWorker } from './outbox.worker';

@ApiTags('Outbox & Event Streaming')
@Controller({ path: 'outbox', version: '1' })
export class OutboxController {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly outboxWorker: OutboxWorker,
  ) {}

  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get Transactional Outbox queue depth & lag metrics (OPS-161)',
    description:
      'Returns current transactional outbox queue counts and oldest pending event age for operational monitoring.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Current queue depth, processing latency, and event counts',
  })
  async getMetrics(): Promise<OutboxMetrics> {
    return this.outboxService.getMetrics();
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Alias for outbox metrics (OPS-161)',
    description:
      'Returns the same queue-depth and lag payload as the metrics endpoint for health dashboards.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Current queue depth and status',
  })
  async getStatus(): Promise<OutboxMetrics> {
    return this.outboxService.getMetrics();
  }

  @Post('process')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger immediate sweep of pending outbox events (OPS-159)',
    description:
      'Claims and dispatches a bounded batch of pending outbox events immediately, returning processing results and metrics.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Batch process outcome and updated queue metrics',
  })
  async triggerProcess(): Promise<OutboxProcessResult> {
    return this.outboxWorker.triggerImmediate();
  }

  @Post('reprocess-dead-letters')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Replay dead-lettered events back into pending queue for retry (OPS-154)',
    description:
      'Moves dead-lettered outbox events back to the pending queue so they can be retried by the dispatcher.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Count of reprocessed events',
  })
  async reprocessDeadLetters(): Promise<{ reprocessedCount: number }> {
    const count = await this.outboxService.reprocessDeadLetters();
    return { reprocessedCount: count };
  }
}
