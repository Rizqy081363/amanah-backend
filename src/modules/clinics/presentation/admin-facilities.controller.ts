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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import { zodPipe } from '../../../common/validation';
import { AdminFacilitiesService } from '../application/admin-facilities.service';
import {
  CreateClinicalIntakeFormDto,
  CreateClinicServiceDto,
  CreateFacilityRoomDto,
  CreateServiceCategoryDto,
  UpdateClinicalIntakeFormDto,
  UpdateClinicServiceDto,
  UpdateFacilityRoomDto,
  UpdateServiceCategoryDto,
} from './dto/admin-facilities.dto';
import {
  CreateFacilityUnitTypeSchema,
  FacilityUnitTypeParamSchema,
  type CreateFacilityUnitTypeInput,
  type FacilityUnitTypeParamInput,
  type UpdateFacilityUnitTypeInput,
  UpdateFacilityUnitTypeSchema,
} from './schemas/facility-unit-type.schema';
import {
  CreateFacilityUnitSchema,
  FacilityUnitParamSchema,
  type CreateFacilityUnitInput,
  type FacilityUnitParamInput,
  type UpdateFacilityUnitInput,
  UpdateFacilityUnitSchema,
} from './schemas/facility-unit.schema';
import {
  BulkFacilityActionSchema,
  type BulkFacilityActionInput,
} from './schemas/facility-bulk.schema';

@ApiTags('Admin Facilities Studio')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@RequirePermissions('clinics:manage')
@Controller({ path: 'admin/facilities', version: '1' })
export class AdminFacilitiesController {
  constructor(private readonly facilitiesService: AdminFacilitiesService) {}

  // ==========================================
  // 0. CLINIC UNIT TYPES (Master Tipe Unit)
  // ==========================================

  @Get('unit-types')
  @ApiOperation({
    summary: 'Mendapatkan seluruh daftar tipe unit fasilitas (Admin)',
    description:
      'Mengambil seluruh master data tipe unit fasilitas beserta jumlah unit terhubung.',
  })
  @ApiOkResponse({ description: 'Daftar tipe unit fasilitas berhasil diambil' })
  async getUnitTypes() {
    return this.facilitiesService.getUnitTypes();
  }

  @Post('unit-types')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan master tipe unit baru (Admin)',
    description:
      'Membuat tipe unit baru yang nantinya dapat diasosiasikan ke unit poliklinik.',
  })
  @ApiCreatedResponse({ description: 'Tipe unit fasilitas berhasil dibuat' })
  async createUnitType(
    @Body(zodPipe(CreateFacilityUnitTypeSchema))
    body: CreateFacilityUnitTypeInput,
  ) {
    return this.facilitiesService.createUnitType(body);
  }

  @Patch('unit-types/:id')
  @ApiOperation({
    summary: 'Memperbarui master data tipe unit (Admin)',
    description: 'Mengubah nama, kode, deskripsi, ikon, atau status tipe unit.',
  })
  @ApiParam({ name: 'id', description: 'ID unik tipe unit fasilitas' })
  @ApiOkResponse({ description: 'Tipe unit fasilitas berhasil diperbarui' })
  async updateUnitType(
    @Param(zodPipe(FacilityUnitTypeParamSchema))
    param: FacilityUnitTypeParamInput,
    @Body(zodPipe(UpdateFacilityUnitTypeSchema))
    body: UpdateFacilityUnitTypeInput,
  ) {
    return this.facilitiesService.updateUnitType(param.id, body);
  }

  @Delete('unit-types/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menonaktifkan tipe unit fasilitas (Admin)',
    description: 'Menonaktifkan master data tipe unit.',
  })
  @ApiParam({ name: 'id', description: 'ID unik tipe unit fasilitas' })
  @ApiNoContentResponse({ description: 'Tipe unit berhasil dinonaktifkan' })
  async deleteUnitType(
    @Param(zodPipe(FacilityUnitTypeParamSchema))
    param: FacilityUnitTypeParamInput,
  ) {
    await this.facilitiesService.deleteUnitType(param.id);
  }

  // ==========================================
  // 1. CLINIC UNITS (Poliklinik / Departemen)
  // ==========================================

  @Get('units')
  @ApiOperation({
    summary: 'Mendapatkan seluruh daftar unit poliklinik fasilitas (Admin)',
    description:
      'Mengambil seluruh unit dengan rincian jumlah ruangan dan kategori layanan.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Filter pencarian nama atau kode' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter status (active/inactive)' })
  @ApiOkResponse({ description: 'Daftar unit fasilitas berhasil diambil' })
  async getUnits(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.facilitiesService.getUnits(search, status);
  }

  @Post('units')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan unit / poliklinik baru (Admin)',
    description: 'Membuat unit pelayanan baru dari kanvas kosong.',
  })
  @ApiCreatedResponse({ description: 'Unit fasilitas berhasil dibuat' })
  async createUnit(
    @Body(zodPipe(CreateFacilityUnitSchema)) body: CreateFacilityUnitInput,
  ) {
    return this.facilitiesService.createUnit(body);
  }

  @Patch('units/:id')
  @ApiOperation({
    summary: 'Memperbarui data unit / poliklinik (Admin)',
    description: 'Mengubah nama, kode, prefix, ikon, atau status unit.',
  })
  @ApiParam({ name: 'id', description: 'ID unik unit fasilitas' })
  @ApiOkResponse({ description: 'Unit fasilitas berhasil diperbarui' })
  async updateUnit(
    @Param(zodPipe(FacilityUnitParamSchema)) param: FacilityUnitParamInput,
    @Body(zodPipe(UpdateFacilityUnitSchema)) body: UpdateFacilityUnitInput,
  ) {
    return this.facilitiesService.updateUnit(param.id, body);
  }

  @Delete('units/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menonaktifkan unit fasilitas (Admin)',
    description: 'Menonaktifkan unit poliklinik dari operasional.',
  })
  @ApiParam({ name: 'id', description: 'ID unik unit fasilitas' })
  @ApiNoContentResponse({ description: 'Unit berhasil dinonaktifkan' })
  async deleteUnit(
    @Param(zodPipe(FacilityUnitParamSchema)) param: FacilityUnitParamInput,
  ) {
    await this.facilitiesService.deleteUnit(param.id);
  }

  // ==========================================
  // 2. CLINIC ROOMS (Ruang Periksa)
  // ==========================================

  @Get('rooms')
  @ApiOperation({
    summary: 'Mendapatkan daftar ruangan periksa (Admin)',
    description:
      'Mengambil seluruh ruangan fisik periksa, dapat difilter per unit.',
  })
  @ApiQuery({
    name: 'unitId',
    required: false,
    description: 'Filter berdasarkan ID unit',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter pencarian nama atau kode',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter status (active/inactive)',
  })
  @ApiOkResponse({ description: 'Daftar ruangan berhasil diambil' })
  async getRooms(
    @Query('unitId') unitId?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.facilitiesService.getRooms(unitId, search, status);
  }

  @Post('rooms')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan ruangan periksa baru (Admin)',
    description:
      'Membuat ruangan baru yang terafiliasi dengan suatu unit poliklinik.',
  })
  @ApiCreatedResponse({ description: 'Ruangan berhasil dibuat' })
  async createRoom(@Body() body: CreateFacilityRoomDto) {
    return this.facilitiesService.createRoom(body);
  }

  @Patch('rooms/:id')
  @ApiOperation({
    summary: 'Memperbarui data ruangan periksa (Admin)',
    description: 'Mengubah nama, kode, atau lokasi ruangan.',
  })
  @ApiParam({ name: 'id', description: 'ID unik ruangan' })
  @ApiOkResponse({ description: 'Ruangan berhasil diperbarui' })
  async updateRoom(
    @Param('id') id: string,
    @Body() body: UpdateFacilityRoomDto,
  ) {
    return this.facilitiesService.updateRoom(id, body);
  }

  @Delete('rooms/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menonaktifkan ruangan periksa (Admin)',
    description: 'Menonaktifkan ruangan periksa dari sistem.',
  })
  @ApiParam({ name: 'id', description: 'ID unik ruangan' })
  @ApiNoContentResponse({ description: 'Ruangan berhasil dinonaktifkan' })
  async deleteRoom(@Param('id') id: string) {
    await this.facilitiesService.deleteRoom(id);
  }

  // ==========================================
  // 3. SERVICE CATEGORIES (Kategori Layanan)
  // ==========================================

  @Get('categories')
  @ApiOperation({
    summary: 'Mendapatkan daftar kategori layanan (Admin)',
    description:
      'Mengambil seluruh kategori layanan medis, dapat difilter per unit.',
  })
  @ApiQuery({
    name: 'unitId',
    required: false,
    description: 'Filter berdasarkan ID unit',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter pencarian nama atau kode',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter status (active/inactive)',
  })
  @ApiOkResponse({ description: 'Daftar kategori berhasil diambil' })
  async getCategories(
    @Query('unitId') unitId?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.facilitiesService.getCategories(unitId, search, status);
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan kategori layanan baru (Admin)',
    description: 'Membuat kategori pengelompokan layanan medis.',
  })
  @ApiCreatedResponse({ description: 'Kategori layanan berhasil dibuat' })
  async createCategory(@Body() body: CreateServiceCategoryDto) {
    return this.facilitiesService.createCategory(body);
  }

  @Patch('categories/:id')
  @ApiOperation({
    summary: 'Memperbarui kategori layanan (Admin)',
    description: 'Mengubah nama, kode, ikon, atau unit induk kategori.',
  })
  @ApiParam({ name: 'id', description: 'ID unik kategori layanan' })
  @ApiOkResponse({ description: 'Kategori layanan berhasil diperbarui' })
  async updateCategory(
    @Param('id') id: string,
    @Body() body: UpdateServiceCategoryDto,
  ) {
    return this.facilitiesService.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menonaktifkan kategori layanan (Admin)',
    description: 'Menonaktifkan kategori layanan.',
  })
  @ApiParam({ name: 'id', description: 'ID unik kategori layanan' })
  @ApiNoContentResponse({
    description: 'Kategori layanan berhasil dinonaktifkan',
  })
  async deleteCategory(@Param('id') id: string) {
    await this.facilitiesService.deleteCategory(id);
  }

  // ==========================================
  // 4. CLINIC SERVICES (Layanan Medis)
  // ==========================================

  @Get('services')
  @ApiOperation({
    summary: 'Mendapatkan daftar layanan medis (Admin)',
    description:
      'Mengambil seluruh layanan tindakan medis, dapat difilter per kategori atau unit.',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter berdasarkan ID kategori',
  })
  @ApiQuery({
    name: 'unitId',
    required: false,
    description: 'Filter berdasarkan ID unit',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter pencarian nama atau kode',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter status (active/inactive)',
  })
  @ApiOkResponse({ description: 'Daftar layanan medis berhasil diambil' })
  async getServices(
    @Query('categoryId') categoryId?: string,
    @Query('unitId') unitId?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.facilitiesService.getServices(categoryId, unitId, search, status);
  }

  @Post('services')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan layanan medis baru (Admin)',
    description:
      'Membuat layanan tindakan medis dengan nama ikon dan keluhan bawaan.',
  })
  @ApiCreatedResponse({ description: 'Layanan medis berhasil dibuat' })
  async createService(@Body() body: CreateClinicServiceDto) {
    return this.facilitiesService.createService(body);
  }

  @Patch('services/:id')
  @ApiOperation({
    summary: 'Memperbarui data layanan medis (Admin)',
    description:
      'Mengubah nama, ikon, alur medis, atau daftar keluhan layanan.',
  })
  @ApiParam({ name: 'id', description: 'ID unik layanan medis' })
  @ApiOkResponse({ description: 'Layanan medis berhasil diperbarui' })
  async updateService(
    @Param('id') id: string,
    @Body() body: UpdateClinicServiceDto,
  ) {
    return this.facilitiesService.updateService(id, body);
  }

  @Delete('services/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menonaktifkan layanan medis (Admin)',
    description: 'Menonaktifkan layanan medis dari operasional klinik.',
  })
  @ApiParam({ name: 'id', description: 'ID unik layanan medis' })
  @ApiNoContentResponse({ description: 'Layanan medis berhasil dinonaktifkan' })
  async deleteService(@Param('id') id: string) {
    await this.facilitiesService.deleteService(id);
  }

  // ==========================================
  // 5. CLINICAL INTAKE FORMS (Dynamic Form Registry)
  // ==========================================

  @Get('forms')
  @ApiOperation({
    summary: 'Mendapatkan daftar formulir rekam medis / intake klinis (Admin)',
    description:
      'Mengambil seluruh master formulir intake yang dapat dikoneksikan ke layanan.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Filter pencarian nama atau kode' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter status (active/inactive)' })
  @ApiOkResponse({ description: 'Daftar formulir intake berhasil diambil' })
  async getForms(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.facilitiesService.getForms(search, status);
  }

  @Post('forms')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan master formulir intake klinis baru (Admin)',
    description:
      'Membuat definisi formulir intake baru yang nantinya dapat dikoneksikan ke layanan medis.',
  })
  @ApiCreatedResponse({ description: 'Formulir intake berhasil dibuat' })
  async createForm(@Body() body: CreateClinicalIntakeFormDto) {
    return this.facilitiesService.createForm(body);
  }

  @Patch('forms/:id')
  @ApiOperation({
    summary: 'Memperbarui master formulir intake (Admin)',
    description: 'Mengubah nama, kode, ikon, atau deskripsi formulir intake.',
  })
  @ApiParam({ name: 'id', description: 'ID unik formulir intake' })
  @ApiOkResponse({ description: 'Formulir intake berhasil diperbarui' })
  async updateForm(
    @Param('id') id: string,
    @Body() body: UpdateClinicalIntakeFormDto,
  ) {
    return this.facilitiesService.updateForm(id, body);
  }

  @Delete('forms/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menonaktifkan master formulir intake (Admin)',
    description: 'Menonaktifkan formulir intake dari sistem.',
  })
  @ApiParam({ name: 'id', description: 'ID unik formulir intake' })
  @ApiNoContentResponse({
    description: 'Formulir intake berhasil dinonaktifkan',
  })
  async deleteForm(@Param('id') id: string) {
    await this.facilitiesService.deleteForm(id);
  }

  // ==========================================
  // 6. BULK FACILITY ACTIONS
  // ==========================================

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eksekusi aksi massal fasilitas klinik (Admin)',
    description:
      'Menonaktifkan, mengaktifkan, atau menghapus beberapa entitas fasilitas sekaligus dengan validasi relasional.',
  })
  @ApiOkResponse({ description: 'Aksi massal berhasil dieksekusi' })
  async bulkAction(
    @Body(zodPipe(BulkFacilityActionSchema)) body: BulkFacilityActionInput,
  ) {
    return this.facilitiesService.bulkAction(body);
  }
}
