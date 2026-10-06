import { Injectable, Logger } from '@nestjs/common';
import { RabbitMQService } from '../../../../common/rabbitmq/rabbitmq.service';
import { NotificationDispatchCommand } from '../../contracts/notification-dispatch.contract';

@Injectable()
export class NotificationGatewayService {
  private readonly logger = new Logger(NotificationGatewayService.name);

  constructor(private readonly rabbitmqService: RabbitMQService) {}

  async dispatch(command: NotificationDispatchCommand): Promise<boolean> {
    if (!command || !command.sourceDomain || !command.content) {
      this.logger.warn('Invalid notification dispatch command rejected');
      return false;
    }

    try {
      const channels =
        command.channels && command.channels.length > 0
          ? command.channels
          : ['in_app'];

      for (const channel of channels) {
        const routingKey = `notifications.dispatch.${command.sourceDomain}.${channel}`;
        await this.rabbitmqService.publish(routingKey, {
          ...command,
          dispatchedAt: new Date().toISOString(),
        });
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to dispatch notification command ${command.commandId}: ${String(error)}`,
      );
      return false;
    }
  }
}
