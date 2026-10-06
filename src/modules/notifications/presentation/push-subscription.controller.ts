import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import {
  PUSH_SUBSCRIPTION_REPOSITORY,
  type PushSubscriptionRepository,
} from '../domain/repositories/push-subscription.repository';
import { SavePushSubscriptionDto } from './dto/save-push-subscription.dto';

@ApiTags('Push Notifications')
@Controller({ path: 'notifications/push', version: '1' })
export class PushSubscriptionController {
  constructor(
    @Inject(PUSH_SUBSCRIPTION_REPOSITORY)
    private readonly pushSubscriptionRepo: PushSubscriptionRepository,
  ) {}

  @Get('public-key')
  getPublicKey(): { publicKey: string | null } {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY || null,
    };
  }

  @Post('subscribe')
  @UseGuards(HybridAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async subscribe(
    @Body() dto: SavePushSubscriptionDto,
    @CurrentUser() user: any,
  ): Promise<{ success: boolean; id: string }> {
    const userId = user?.id || user?.sub;
    const record = await this.pushSubscriptionRepo.upsert({
      userId,
      endpoint: dto.endpoint,
      p256dhKey: dto.keys.p256dh,
      authKey: dto.keys.auth,
      platform: dto.platform,
      userAgent: dto.userAgent,
    });

    return {
      success: true,
      id: record.id,
    };
  }

  @Delete('unsubscribe')
  @UseGuards(HybridAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async unsubscribe(
    @Body('endpoint') endpoint: string,
    @CurrentUser() user: any,
  ): Promise<{ success: boolean }> {
    const userId = user?.id || user?.sub;
    if (endpoint) {
      await this.pushSubscriptionRepo.deleteByUserIdAndEndpoint(
        userId,
        endpoint,
      );
    }
    return { success: true };
  }
}
