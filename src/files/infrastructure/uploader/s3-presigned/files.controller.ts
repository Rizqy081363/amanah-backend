import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { FileUploadDto } from './dto/file.dto';
import { FileResponseDto } from './dto/file-response.dto';
import { FilesS3PresignedService } from './files.service';

@ApiTags('Files (Pengunggahan Berkas Medis)')
@Controller({
  path: 'files',
  version: '1',
})
export class FilesS3PresignedController {
  constructor(private readonly filesService: FilesS3PresignedService) {}

  @ApiOperation({
    summary: 'Minta URL presigned untuk unggah S3 langsung',
    description:
      'Menghasilkan URL presigned Amazon S3 untuk pengunggahan file langsung dari klien frontend.',
  })
  @ApiCreatedResponse({
    type: FileResponseDto,
    description: 'URL presigned berhasil dibuat',
  })
  @ApiUnauthorizedResponse({
    description: 'Sesi token tidak valid atau tidak disertakan',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Payload nama berkas atau tipe data tidak valid',
  })
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'))
  @Post('upload')
  async uploadFile(@Body() file: FileUploadDto) {
    return this.filesService.create(file);
  }
}
