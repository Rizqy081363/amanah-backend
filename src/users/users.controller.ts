import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles } from '../roles/roles.decorator';
import { RoleEnum } from '../roles/roles.enum';
import { RolesGuard } from '../roles/roles.guard';
import {
  InfinityPaginationResponse,
  InfinityPaginationResponseDto,
} from '../utils/dto/infinity-pagination-response.dto';
import { infinityPagination } from '../utils/infinity-pagination';
import { NullableType } from '../utils/types/nullable.type';
import { User } from './domain/user';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiBearerAuth('access-token')
@Roles(RoleEnum.admin)
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiTags('Users (Manajemen Pengguna Admin)')
@ApiUnauthorizedResponse({
  description: 'Sesi token tidak valid atau telah kedaluwarsa',
})
@ApiForbiddenResponse({
  description:
    'Akses ditolak: Hanya administrator yang diizinkan mengakses resource ini',
})
@Controller({
  path: 'users',
  version: '1',
})
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiCreatedResponse({
    type: User,
    description: 'Pengguna baru berhasil dibuat',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Email sudah terdaftar atau entitas referensi tidak ditemukan',
  })
  @ApiOperation({
    summary: 'Membuat akun pengguna baru (Admin)',
    description:
      'Administrator mendaftarkan akun pengguna baru beserta peran dan statusnya.',
  })
  @SerializeOptions({
    groups: ['admin'],
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createProfileDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createProfileDto);
  }

  @ApiOkResponse({
    type: InfinityPaginationResponse(User),
    description: 'Daftar pengguna berhasil dimuat dengan pagination',
  })
  @ApiOperation({
    summary: 'Daftar pengguna dengan pagination dan filter (Admin)',
    description:
      'Mengambil daftar pengguna terdaftar dengan dukungan penyaringan peran, status, dan sorting.',
  })
  @SerializeOptions({
    groups: ['admin'],
  })
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: QueryUserDto,
  ): Promise<InfinityPaginationResponseDto<User>> {
    const page = query?.page ?? 1;
    let limit = query?.limit ?? 10;
    if (limit > 50) {
      limit = 50;
    }

    return infinityPagination(
      await this.usersService.findManyWithPagination({
        filterOptions: query?.filters,
        sortOptions: query?.sort,
        paginationOptions: {
          page,
          limit,
        },
      }),
      { page, limit },
    );
  }

  @ApiOkResponse({
    type: User,
    description: 'Detail pengguna berhasil ditemukan',
  })
  @ApiNotFoundResponse({
    description: 'Pengguna dengan ID yang diberikan tidak ditemukan',
  })
  @ApiOperation({
    summary: 'Mendapatkan profil pengguna berdasarkan ID (Admin)',
    description:
      'Mengambil data lengkap profil seorang pengguna berdasarkan ID unik.',
  })
  @SerializeOptions({
    groups: ['admin'],
  })
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
    description: 'ID pengguna unik',
    example: 'a8e79644-a541-4d05-b431-99c99d8620ec',
  })
  findOne(@Param('id') id: User['id']): Promise<NullableType<User>> {
    return this.usersService.findById(id);
  }

  @ApiOkResponse({
    type: User,
    description: 'Pengguna berhasil diperbarui',
  })
  @ApiNotFoundResponse({
    description: 'Pengguna dengan ID yang diberikan tidak ditemukan',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Email baru sudah digunakan pengguna lain atau validasi gagal',
  })
  @ApiOperation({
    summary: 'Memperbarui profil pengguna (Admin)',
    description: 'Mengubah nama, email, password, status, atau role pengguna.',
  })
  @SerializeOptions({
    groups: ['admin'],
  })
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
    description: 'ID pengguna unik',
    example: 'a8e79644-a541-4d05-b431-99c99d8620ec',
  })
  update(
    @Param('id') id: User['id'],
    @Body() updateProfileDto: UpdateUserDto,
  ): Promise<User | null> {
    return this.usersService.update(id, updateProfileDto);
  }

  @Delete(':id')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
    description: 'ID pengguna yang akan dinonaktifkan',
    example: 'a8e79644-a541-4d05-b431-99c99d8620ec',
  })
  @ApiOperation({
    summary: 'Menonaktifkan pengguna / Soft delete (Admin)',
    description:
      'Menonaktifkan akun pengguna dari sistem tanpa menghapus data historis medis.',
  })
  @ApiNoContentResponse({
    description: 'Pengguna berhasil dinonaktifkan',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: User['id']): Promise<void> {
    return this.usersService.remove(id);
  }
}
