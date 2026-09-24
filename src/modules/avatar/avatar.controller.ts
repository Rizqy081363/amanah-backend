import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  HybridAuthGuard,
  Public,
  Roles,
  RolesGuard,
} from '../../common/auth';
import { AvatarService } from './avatar.service';

@ApiTags('Users / Avatar')
@Controller({
  path: 'users',
  version: '1',
})
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  private async handleUpload(userId: string, file?: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Berkas gambar (file) wajib disertakan');
    }
    return this.avatarService.uploadAvatar(userId, file.buffer);
  }

  @Patch('me/avatar')
  @UseGuards(HybridAuthGuard)
  @ApiBearerAuth('access-token')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload atau perbarui avatar pengguna (PATCH)',
    description:
      'Menerima file gambar (JPEG, PNG, WebP hingga 5MB), memvalidasi magic bytes, mengubah ukuran menjadi 512x512 cover, menghapus metadata EXIF, mengonversi ke WebP, dan memperbarui avatar pengguna secara kanonikal.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Berkas gambar avatar (JPEG, PNG, WebP max 5MB)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar berhasil diperbarui',
  })
  @HttpCode(HttpStatus.OK)
  async uploadAvatarPatch(
    @CurrentUser() user: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.handleUpload(user.id, file);
  }

  @Post('me/avatar')
  @UseGuards(HybridAuthGuard)
  @ApiBearerAuth('access-token')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload atau perbarui avatar pengguna (POST)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Berkas gambar avatar (JPEG, PNG, WebP max 5MB)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar berhasil diperbarui',
  })
  @HttpCode(HttpStatus.OK)
  async uploadAvatarPost(
    @CurrentUser() user: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.handleUpload(user.id, file);
  }

  @Patch(':id/avatar')
  @UseGuards(HybridAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload atau perbarui avatar pengguna berdasarkan ID (PATCH Admin)',
    description:
      'Administrator mengunggah berkas foto profil (JPEG, PNG, WebP hingga 5MB) untuk pengguna/dokter berdasarkan UUID pengguna.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'ID pengguna (UUID)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Berkas gambar avatar (JPEG, PNG, WebP max 5MB)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar pengguna berhasil diperbarui oleh Administrator',
  })
  @HttpCode(HttpStatus.OK)
  async uploadUserAvatarPatch(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.handleUpload(id, file);
  }

  @Post(':id/avatar')
  @UseGuards(HybridAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload atau perbarui avatar pengguna berdasarkan ID (POST Alias Admin)',
    description:
      'Administrator mengunggah berkas foto profil untuk pengguna/dokter berdasarkan UUID pengguna.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'ID pengguna (UUID)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Berkas gambar avatar (JPEG, PNG, WebP max 5MB)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar pengguna berhasil diperbarui oleh Administrator',
  })
  @HttpCode(HttpStatus.OK)
  async uploadUserAvatarPost(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.handleUpload(id, file);
  }

  @Delete('me/avatar')
  @UseGuards(HybridAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Hapus avatar kustom pengguna',
    description:
      'Menghapus avatar kustom dan mengembalikan representasi avatar ke fallback inisial.',
  })
  @HttpCode(HttpStatus.OK)
  async deleteAvatar(@CurrentUser() user: any) {
    await this.avatarService.deleteAvatar(user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Avatar berhasil dihapus dan dikembalikan ke inisial nama',
    };
  }

  @Get('me/avatar')
  @UseGuards(HybridAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Ambil gambar avatar pengguna yang sedang login',
  })
  async getMyAvatar(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.getAvatar(user.id, req, res);
  }

  @Get(':id/avatar')
  @Public()
  @ApiOperation({
    summary: 'Ambil gambar avatar publik pengguna',
    description:
      'Mengambil avatar pengguna. Jika memiliki avatar kustom, mengalirkan WebP dengan ETag dan Cache-Control. Jika menggunakan OAuth, mengalihkan 307 ke URL eksternal. Jika tidak ada, mengalirkan SVG inisial nama.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'ID pengguna (UUID)',
  })
  async getAvatar(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const resource = await this.avatarService.getAvatarResource(id);

    if (resource.kind === 'redirect') {
      res.setHeader(
        'Cache-Control',
        'public, max-age=3600, stale-while-revalidate=86400',
      );
      res.redirect(resource.statusCode, resource.url);
      return;
    }

    // RFC 7232 weak/strong validator comparison
    const clientEtag = req.headers['if-none-match'];
    if (clientEtag) {
      const cleanClient = clientEtag.replace(/^W\//, '').replace(/^"|"$/g, '');
      const cleanResource = resource.etag
        .replace(/^W\//, '')
        .replace(/^"|"$/g, '');
      if (cleanClient === cleanResource || clientEtag === resource.etag) {
        res.status(HttpStatus.NOT_MODIFIED).end();
        return;
      }
    }

    res.setHeader('Content-Type', resource.mimeType);
    res.setHeader('Content-Length', resource.byteSize);
    res.setHeader('ETag', resource.etag);
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, stale-while-revalidate=3600',
    );

    if (resource.kind === 'stream') {
      resource.stream.pipe(res);
      return;
    }

    if (resource.kind === 'svg') {
      res.status(HttpStatus.OK).send(resource.buffer);
      return;
    }
  }
}
