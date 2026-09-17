import {
  Controller,
  Post,
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
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { FileResponseDto } from './dto/file-response.dto';
import { FilesS3Service } from './files.service';

@ApiTags('Files (Pengunggahan Berkas Medis)')
@Controller({
  path: 'files',
  version: '1',
})
export class FilesS3Controller {
  constructor(private readonly filesService: FilesS3Service) {}

  @ApiOperation({
    summary: 'Unggah berkas ke AWS S3',
    description:
      'Mengunggah berkas multipart/form-data langsung ke AWS S3 bucket terkonfigurasi.',
  })
  @ApiCreatedResponse({
    type: FileResponseDto,
    description: 'Berkas berhasil diunggah ke S3',
  })
  @ApiUnauthorizedResponse({
    description: 'Sesi token tidak valid atau tidak disertakan',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Format berkas tidak valid atau gagal diproses',
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
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.MulterS3.File,
  ): Promise<FileResponseDto> {
    return this.filesService.create(file);
  }
}
