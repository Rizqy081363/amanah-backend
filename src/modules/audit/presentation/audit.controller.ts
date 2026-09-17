import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { AuditService } from '../application/audit.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@ApiTags('Audit Logs (Jejak Rekaman Audit)')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({
  path: 'audit-logs',
  version: '1',
})
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Melihat seluruh riwayat audit perubahan sistem (Khusus Admin)',
    description:
      'Mengambil jejak audit operasional klinik termasuk mutasi janji temu, antrean, dan pengaturan master.',
  })
  @ApiOkResponse({ description: 'Daftar jejak audit berhasil diambil' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya Admin yang memiliki akses' })
  async findAll(@Query() query: QueryAuditLogDto) {
    return this.auditService.findAll(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Melihat detail satu catatan audit spesifik berdasarkan ID',
    description:
      'Mengambil rincian lengkap perubahan status, nilai lama, nilai baru, serta konteks aktor dari rekaman audit.',
  })
  @ApiParam({ name: 'id', description: 'UUID rekaman log audit' })
  @ApiOkResponse({ description: 'Detail audit log berhasil diambil' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya Admin yang memiliki akses' })
  async findById(@Param('id') id: string) {
    return this.auditService.findById(id);
  }
}
