import { Injectable, Logger } from '@nestjs/common';
import { NotificationRule } from '../domain/entities/notification-rule.entity';

@Injectable()
export class NotificationRulesRegistry {
  private readonly logger = new Logger(NotificationRulesRegistry.name);
  private readonly rules = new Map<string, NotificationRule>();

  register<T>(rule: NotificationRule<T>): void {
    if (this.rules.has(rule.eventType)) {
      this.logger.warn(
        `Overwriting existing notification rule for event: "${rule.eventType}"`,
      );
    }
    this.rules.set(rule.eventType, rule as NotificationRule);
    this.logger.log(
      `Registered notification rule for event: "${rule.eventType}" (channels: ${rule.defaultChannels.join(', ')})`,
    );
  }

  get(eventType: string): NotificationRule | undefined {
    return this.rules.get(eventType);
  }

  getRule(eventType: string): NotificationRule | undefined {
    return this.get(eventType);
  }

  registerRule<T>(rule: NotificationRule<T>): void {
    this.register(rule);
  }

  has(eventType: string): boolean {
    return this.rules.has(eventType);
  }

  getAll(): NotificationRule[] {
    return Array.from(this.rules.values());
  }

  clear(): void {
    this.rules.clear();
  }
}
