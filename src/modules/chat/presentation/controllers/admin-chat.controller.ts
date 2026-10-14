import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { ChatService } from '../../application/services/chat.service';
import { AdminConversationQueryDto } from '../dto/conversation-query.dto';
import { MessageQueryDto } from '../dto/message-query.dto';
import { SendMessageDto } from '../dto/send-message.dto';

@ApiTags('Admin Chat (Inbox Admin & Staf)')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi admin tidak valid atau token tidak disertakan',
})
@Controller({ path: 'admin/chat', version: '1' })
export class AdminChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Melihat daftar kotak masuk percakapan (Admin Inbox)',
    description:
      'Mendukung filter status (open/closed), filter awaitingReply, pencarian teks, dan keyset pagination.',
  })
  async getConversations(@Query() query: AdminConversationQueryDto) {
    const result = await this.chatService.getAdminConversations({
      status: query.status,
      awaitingReply: query.awaitingReply,
      search: query.search,
      cursor: query.cursor,
      limit: query.limit,
    });

    return {
      data: result.items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  @Get('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mengambil riwayat pesan percakapan (Admin)',
  })
  @ApiParam({ name: 'id', description: 'ID percakapan' })
  async getMessages(@Param('id') id: string, @Query() query: MessageQueryDto) {
    const result = await this.chatService.getConversationMessages(
      id,
      { cursor: query.cursor, limit: query.limit },
      { isAdmin: true },
    );

    return {
      data: result.items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Mengirim balasan admin ke utas percakapan',
  })
  @ApiParam({ name: 'id', description: 'ID percakapan' })
  async sendMessage(
    @Param('id') id: string,
    @Body() body: SendMessageDto,
    @CurrentUser() user: any,
  ) {
    const adminName = user.staff?.fullName || user.name || 'Admin Klinik';
    return this.chatService.sendAdminMessage(
      id,
      user.id,
      adminName,
      body.body,
      body.clientMessageId,
    );
  }

  @Patch('conversations/:id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Menutup/menyelesaikan utas percakapan',
  })
  @ApiParam({ name: 'id', description: 'ID percakapan' })
  async closeConversation(@Param('id') id: string) {
    return this.chatService.closeConversation(id);
  }
}
