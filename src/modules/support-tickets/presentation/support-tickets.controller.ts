import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import {
  SUPPORT_TICKET_REPOSITORY,
  SupportTicketRepository,
} from '../domain/repositories/support-ticket.repository';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { CreateTicketMessageDto } from './dto/create-ticket-message.dto';

@ApiTags('Support Tickets (Bantuan Teknis IT)')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@Controller({ path: 'support-tickets', version: '1' })
export class SupportTicketsController {
  constructor(
    @Inject(SUPPORT_TICKET_REPOSITORY)
    private readonly ticketRepo: SupportTicketRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Membuat tiket laporan kendala teknis IT baru (Mobile App)',
    description:
      'Dokter atau staf melaporkan kendala teknis (scanner error, GPS, SIMRS) untuk ditindaklanjuti oleh teknisi IT klinik.',
  })
  @ApiCreatedResponse({
    description:
      'Tiket kendala teknis berhasil dibuat dengan nomor tiket otomatis',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        ticketNumber: { type: 'string', example: 'TK-2026-0819' },
        title: {
          type: 'string',
          example: 'Scanner QR poliklinik anak lambat membaca kode',
        },
        status: { type: 'string', example: 'open' },
        priority: { type: 'string', example: 'normal' },
        createdAt: { type: 'string', example: '2026-09-17T12:00:00.000Z' },
      },
    },
  })
  @ApiUnprocessableEntityResponse({
    description: 'Data laporan kendala tidak lengkap atau tidak valid',
  })
  async createTicket(
    @Body() body: CreateSupportTicketDto,
    @CurrentUser() user: any,
  ) {
    return this.ticketRepo.createTicket({
      reporterUserId: user.id,
      title: body.title,
      description: body.description,
      priority: body.priority,
      sourceChannel: body.sourceChannel || 'mobile_app',
    });
  }

  @Get('my-tickets')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Melihat seluruh riwayat tiket laporan kendala saya (Mobile App)',
    description:
      'Menampilkan daftar seluruh laporan kendala teknis yang diajukan oleh user login beserta status penanganannya.',
  })
  @ApiOkResponse({
    description: 'Daftar riwayat tiket kendala berhasil diambil',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          ticketNumber: { type: 'string', example: 'TK-2026-0819' },
          title: {
            type: 'string',
            example: 'Scanner QR poliklinik anak lambat membaca kode',
          },
          status: { type: 'string', example: 'open' },
          priority: { type: 'string', example: 'normal' },
          technicianNote: {
            type: 'string',
            example:
              'Teknisi sedang melakukan pengecekan lensa scanner dan firmware bridge SIMRS.',
          },
          createdAt: { type: 'string', example: '2026-09-17T12:00:00.000Z' },
        },
      },
    },
  })
  async getMyTickets(@CurrentUser() user: any) {
    return this.ticketRepo.findMyTickets(user.id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Melihat detail tiket laporan kendala (Mobile App)',
    description:
      'Mengambil informasi lengkap satu tiket laporan teknis berdasarkan ID unik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik tiket kendala',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Detail tiket kendala berhasil diambil',
  })
  @ApiNotFoundResponse({
    description: 'Tiket dengan ID yang diberikan tidak ditemukan',
  })
  async getTicketById(@Param('id') id: string) {
    const ticket = await this.ticketRepo.findTicketById(id);
    if (!ticket) {
      throw new NotFoundException(
        `Tiket kendala dengan ID ${id} tidak ditemukan`,
      );
    }
    return ticket;
  }

  @Get(':id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mengambil riwayat percakapan/chat tiket kendala (Mobile App)',
    description:
      'Menampilkan kronologi pesan antara staf pelapor dan teknisi IT terkait tiket bantuan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik tiket kendala',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Daftar pesan chat tiket kendala berhasil diambil',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          ticketId: { type: 'string' },
          senderType: { type: 'string', example: 'user' },
          senderName: { type: 'string', example: 'dr. Rayhan Pratama, Sp.A' },
          body: {
            type: 'string',
            example: 'Scanner sudah dicoba restart ulang.',
          },
          createdAt: { type: 'string', example: '2026-09-17T12:00:00.000Z' },
        },
      },
    },
  })
  async getTicketMessages(@Param('id') id: string) {
    return this.ticketRepo.findMessages(id);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Mengirim pesan balasan/chat baru pada tiket (Mobile App)',
    description:
      'Mengirim pesan tambahan atau balasan ke teknisi IT dalam utas percakapan tiket kendala.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik tiket kendala',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiCreatedResponse({
    description: 'Pesan chat berhasil dikirim',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Pesan chat kosong atau format data tidak valid',
  })
  async sendTicketMessage(
    @Param('id') id: string,
    @Body() body: CreateTicketMessageDto,
    @CurrentUser() user: any,
  ) {
    const ticket = await this.ticketRepo.findTicketById(id);
    if (!ticket) {
      throw new NotFoundException(
        `Tiket kendala dengan ID ${id} tidak ditemukan`,
      );
    }

    return this.ticketRepo.addMessage({
      ticketId: id,
      senderUserId: user.id,
      senderType: 'reporter',
      body: body.message,
    });
  }
}
