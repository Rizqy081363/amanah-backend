import {
  Controller,
  Get,
  Param,
  Post,
  Response,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response as ExpressResponse } from 'express';
import { FileResponseDto } from './dto/file-response.dto';
import { FilesLocalService } from './files.service';

@ApiTags('Files (Pengunggahan Berkas Medis)')
@Controller({
  path: 'files',
  version: '1',
})
export class FilesLocalController {
  constructor(private readonly filesService: FilesLocalService) {}

  @ApiCreatedResponse({
    type: FileResponseDto,
    description: 'Berkas berhasil diunggah dan disimpan di storage lokal',
  })
  @ApiUnauthorizedResponse({
    description: 'Sesi token tidak valid atau tidak disertakan',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Berkas tidak dipilih atau format berkas tidak diizinkan',
  })
  @ApiOperation({
    summary: 'Unggah berkas ke penyimpanan lokal',
    description:
      'Mengunggah file (foto profil, surat rujukan, lampiran izin) berformat multipart/form-data ke server.',
  })
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'))
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Berkas biner yang diunggah',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<FileResponseDto> {
    return this.filesService.create(file);
  }

  @Get(':path')
  @ApiExcludeEndpoint()
  download(@Param('path') path: string, @Response() response: ExpressResponse) {
    return response.sendFile(path, { root: './files' });
  }
}
