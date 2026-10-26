import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RealtimeTicketService } from '../../../notifications/application/services/realtime-ticket.service';
import { createRealtimePrincipal } from '../../../notifications/contracts/realtime-session.contract';
import { ChatService } from '../../application/services/chat.service';
import { ChatTicketDto } from '../dto/chat-ticket.dto';
import { CreateConversationDto } from '../dto/create-conversation.dto';
import { MessageQueryDto } from '../dto/message-query.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { OptionalJwtAuthGuard } from '../guards/optional-jwt-auth.guard';

@ApiTags('Chat (Pasien & Tamu)')
@Controller({ path: 'chat', version: '1' })
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly realtimeTicketService: RealtimeTicketService,
  ) {}

  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Membuka atau mengambil percakapan aktif pasien/tamu',
    description:
      'Jika pengguna telah login, thread percakapan dikaitkan dengan akun pengguna. Jika belum, menggunakan identitas guestId.',
  })
  async getOrCreateConversation(
    @Body() body: CreateConversationDto,
    @CurrentUser() user: any,
  ) {
    return this.chatService.getOrCreateCustomerConversation({
      userId: user?.id,
      guestId: body.guestId,
      name: body.name,
      email: body.email,
    });
  }

  @Get('conversations/active')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Mengecek percakapan aktif saat ini',
  })
  async getActiveConversation(
    @Query('guestId') guestId?: string,
    @CurrentUser() user?: any,
  ) {
    return this.chatService.getActiveConversation(user?.id, guestId);
  }

  @Get('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Mengambil riwayat pesan percakapan (Pasien/Tamu)',
  })
  @ApiParam({ name: 'id', description: 'ID percakapan' })
  async getMessages(
    @Param('id') id: string,
    @Query() query: MessageQueryDto,
    @CurrentUser() user?: any,
  ) {
    const result = await this.chatService.getConversationMessages(
      id,
      { cursor: query.cursor, limit: query.limit },
      { userId: user?.id, guestId: query.guestId, isAdmin: false },
    );

    return {
      data: result.items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Mengirim pesan baru dari pasien/tamu',
  })
  @ApiParam({ name: 'id', description: 'ID percakapan' })
  async sendMessage(
    @Param('id') id: string,
    @Body() body: SendMessageDto,
    @CurrentUser() user?: any,
  ) {
    return this.chatService.sendCustomerMessage(
      id,
      body.body,
      body.clientMessageId,
      {
        userId: user?.id,
        guestId: body.guestId,
        userName: user?.name,
      },
    );
  }

  @Post('realtime-ticket')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Mendapatkan ticket single-use untuk koneksi WebSocket realtime chat',
    description:
      'Dapat digunakan oleh pengguna yang telah login atau tamu via guestId.',
  })
  async getRealtimeTicket(
    @Body() body: ChatTicketDto,
    @CurrentUser() user?: any,
  ) {
    if (user?.id) {
      return this.realtimeTicketService.createTicket(
        createRealtimePrincipal(user),
      );
    }

    if (body?.guestId) {
      return this.realtimeTicketService.createTicket({
        userId: body.guestId,
        roleCode: 'guest',
        roles: ['guest'],
      });
    }

    throw new BadRequestException(
      'Either authenticated user or guestId is required',
    );
  }

  @Get('presence')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mengecek status ketersediaan admin klinik',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        adminOnline: { type: 'boolean' },
      },
    },
  })
  async getPresence() {
    return {
      adminOnline: this.chatService.isAdminOnline(),
    };
  }
}
