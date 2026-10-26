import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { RealtimeTicketService } from '../application/services/realtime-ticket.service';
import { createRealtimePrincipal } from '../contracts/realtime-session.contract';

@ApiTags('Realtime (WebSocket Ticket Auth)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@Controller({ path: 'realtime', version: '1' })
export class RealtimeTicketController {
  constructor(private readonly realtimeTicketService: RealtimeTicketService) {}

  @Post('ticket')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Menerbitkan tiket sekali-pakai (single-use) untuk koneksi WebSocket realtime',
    description:
      'Menghasilkan token tiket CSPRNG pendek (berlaku 60 detik) untuk handshake Socket.IO tanpa mengekspos cookie atau kredensial mentah.',
  })
  @ApiOkResponse({
    description: 'Tiket realtime berhasil diterbitkan',
    schema: {
      type: 'object',
      properties: {
        ticket: { type: 'string', example: 'dGhpcy1pcy1hLXNhbXBsZS10aWNrZXQ' },
        expiresInSec: { type: 'number', example: 60 },
      },
    },
  })
  async issueTicket(@CurrentUser() user: any) {
    const principal = createRealtimePrincipal(user);
    return this.realtimeTicketService.createTicket(principal);
  }
}
