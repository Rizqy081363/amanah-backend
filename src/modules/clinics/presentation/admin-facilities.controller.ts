import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
  LinkCategoriesToUnitDto,
  LinkServicesToCategoryDto,
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
import {
  CreateFacilityRelationshipSchema,
  FacilityRelationshipParamSchema,
  type CreateFacilityRelationshipInput,
  type FacilityRelationshipParamInput,
  type UpdateFacilityRelationshipInput,
  UpdateFacilityRelationshipSchema,
} from './schemas/facility-relationship.schema';

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
  @RequirePermissions('clinics:manage', 'appointments:read', 'appointments:book')
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
    summary: 'Menghapus permanen tipe unit fasilitas (Admin)',
    description: 'Menghapus fisik master data tipe unit dari basis data jika tidak memiliki unit fasilitas terhubung.',
  })
  @ApiParam({ name: 'id', description: 'ID unik tipe unit fasilitas' })
  @ApiNoContentResponse({ description: 'Tipe unit berhasil dihapus permanen' })
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
  @RequirePermissions('clinics:manage', 'appointments:read', 'appointments:book')
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
    summary: 'Menghapus permanen unit fasilitas (Admin)',
    description: 'Menghapus fisik unit poliklinik dari basis data jika tidak memiliki relasi aktif.',
  })
  @ApiParam({ name: 'id', description: 'ID unik unit fasilitas' })
  @ApiNoContentResponse({ description: 'Unit berhasil dihapus permanen' })
  async deleteUnit(
    @Param(zodPipe(FacilityUnitParamSchema)) param: FacilityUnitParamInput,
  ) {
    await this.facilitiesService.deleteUnit(param.id);
  }

  @Post('units/:id/categories')
  @ApiOperation({
    summary: 'Menautkan kategori layanan ke unit poliklinik (Admin)',
    description: 'Menambahkan relasi kategori layanan ke unit poliklinik.',
  })
  @ApiParam({ name: 'id', description: 'ID unik unit fasilitas' })
  @ApiOkResponse({ description: 'Kategori berhasil ditautkan ke unit' })
  async linkCategoriesToUnit(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: LinkCategoriesToUnitDto,
  ) {
    return this.facilitiesService.linkCategoriesToUnit(id, body);
  }

  @Delete('units/:id/categories/:categoryId')
  @ApiOperation({
    summary: 'Melepas relasi kategori layanan dari unit poliklinik (Admin)',
    description: 'Menghapus relasi mapping kategori layanan dari unit fasilitas.',
  })
  @ApiParam({ name: 'id', description: 'ID unik unit fasilitas' })
  @ApiParam({ name: 'categoryId', description: 'ID unik kategori layanan' })
  @ApiOkResponse({ description: 'Relasi kategori berhasil dilepas dari unit' })
  async unlinkCategoryFromUnit(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('categoryId', new ParseUUIDPipe({ version: '4' })) categoryId: string,
  ) {
    return this.facilitiesService.unlinkCategoryFromUnit(id, categoryId);
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
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateFacilityRoomDto,
  ) {
    return this.facilitiesService.updateRoom(id, body);
  }

  @Delete('rooms/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus permanen ruangan periksa (Admin)',
    description: 'Menghapus fisik ruangan periksa dari basis data jika tidak memiliki janji temu terhubung.',
  })
  @ApiParam({ name: 'id', description: 'ID unik ruangan' })
  @ApiNoContentResponse({ description: 'Ruangan berhasil dihapus permanen' })
  async deleteRoom(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.facilitiesService.deleteRoom(id);
  }

  // ==========================================
  // 3. SERVICE CATEGORIES (Kategori Layanan)
  // ==========================================

  @Get('categories')
  @RequirePermissions('clinics:manage', 'appointments:read', 'appointments:book')
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
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateServiceCategoryDto,
  ) {
    return this.facilitiesService.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus permanen kategori layanan (Admin)',
    description: 'Menghapus fisik kategori layanan dari basis data jika tidak memiliki service medis terhubung.',
  })
  @ApiParam({ name: 'id', description: 'ID unik kategori layanan' })
  @ApiNoContentResponse({
    description: 'Kategori layanan berhasil dihapus permanen',
  })
  async deleteCategory(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.facilitiesService.deleteCategory(id);
  }

  @Post('categories/:id/services')
  @ApiOperation({
    summary: 'Menautkan service medis ke kategori layanan (Admin)',
    description: 'Menambahkan relasi service medis ke kategori layanan.',
  })
  @ApiParam({ name: 'id', description: 'ID unik kategori layanan' })
  @ApiOkResponse({ description: 'Service berhasil ditautkan ke kategori' })
  async linkServicesToCategory(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: LinkServicesToCategoryDto,
  ) {
    return this.facilitiesService.linkServicesToCategory(id, body.serviceIds);
  }

  @Delete('categories/:id/services/:serviceId')
  @ApiOperation({
    summary: 'Melepas relasi service medis dari kategori layanan (Admin)',
    description:
      'Menghapus relasi mapping antara kategori layanan dan service medis tanpa menghapus service itu sendiri.',
  })
  @ApiParam({ name: 'id', description: 'ID unik kategori layanan' })
  @ApiParam({ name: 'serviceId', description: 'ID unik service medis' })
  @ApiOkResponse({ description: 'Relasi service berhasil dilepas dari kategori' })
  async unlinkServiceFromCategory(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('serviceId', new ParseUUIDPipe({ version: '4' })) serviceId: string,
  ) {
    return this.facilitiesService.unlinkServiceFromCategory(id, serviceId);
  }

  // ==========================================
  // 4. CLINIC SERVICES
  // ==========================================

  @Get('services')
  @RequirePermissions('clinics:manage', 'appointments:read', 'appointments:book')
  @ApiOperation({
    summary: 'Mendapatkan daftar services (Admin)',
    description:
      'Mengambil seluruh services, dapat difilter per kategori atau unit.',
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
  @ApiOkResponse({ description: 'Daftar services berhasil diambil' })
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
    summary: 'Menambahkan services baru (Admin)',
    description:
      'Membuat services dengan nama ikon dan keluhan bawaan.',
  })
  @ApiCreatedResponse({ description: 'Services berhasil dibuat' })
  async createService(@Body() body: CreateClinicServiceDto) {
    return this.facilitiesService.createService(body);
  }

  @Patch('services/:id')
  @ApiOperation({
    summary: 'Memperbarui data services (Admin)',
    description:
      'Mengubah nama, ikon, alur medis, atau daftar keluhan services.',
  })
  @ApiParam({ name: 'id', description: 'ID unik services' })
  @ApiOkResponse({ description: 'Services berhasil diperbarui' })
  async updateService(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateClinicServiceDto,
  ) {
    return this.facilitiesService.updateService(id, body);
  }

  @Delete('services/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus permanen services (Admin)',
    description: 'Menghapus fisik services dari basis data jika tidak memiliki riwayat pemeriksaan atau janji temu aktif.',
  })
  @ApiParam({ name: 'id', description: 'ID unik services' })
  @ApiNoContentResponse({ description: 'Services berhasil dihapus permanen' })
  async deleteService(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.facilitiesService.deleteService(id);
  }

  // ==========================================
  // 5. CLINICAL INTAKE FORMS (Dynamic Form Registry)
  // ==========================================

  @Get('forms')
  @RequirePermissions('clinics:manage', 'appointments:read', 'appointments:book')
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
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateClinicalIntakeFormDto,
  ) {
    return this.facilitiesService.updateForm(id, body);
  }

  @Put('forms/:id/schema')
  @ApiOperation({
    summary: 'Memperbarui JSON schema deklaratif formulir klinis (Admin Builder)',
  })
  @ApiParam({ name: 'id', description: 'ID unik formulir intake' })
  @ApiOkResponse({ description: 'Skema formulir intake berhasil diperbarui' })
  async updateFormSchema(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: Record<string, any>,
  ) {
    const schema =
      body && typeof body === 'object' && 'schema' in body && body.schema !== undefined
        ? body.schema
        : body;
    return this.facilitiesService.updateForm(id, { schema });
  }

  @Delete('forms/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus permanen master formulir intake (Admin)',
    description: 'Menghapus fisik formulir intake dari basis data jika tidak terhubung ke service medis aktif.',
  })
  @ApiParam({ name: 'id', description: 'ID unik formulir intake' })
  @ApiNoContentResponse({
    description: 'Formulir intake berhasil dihapus permanen',
  })
  async deleteForm(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.facilitiesService.deleteForm(id);
  }

  // ==========================================
  // 6. PATIENT RELATIONSHIPS (Relasi Pasien)
  // ==========================================

  @Get('relationships')
  @ApiOperation({
    summary: 'Mendapatkan seluruh master data tipe relasi pasien (Admin)',
    description:
      'Mengambil seluruh tipe relasi pasien beserta jumlah afiliasi terhubung.',
  })
  @ApiOkResponse({
    description: 'Daftar tipe relasi pasien berhasil diambil',
  })
  async getRelationships() {
    return this.facilitiesService.getRelationships();
  }

  @Post('relationships')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan master tipe relasi pasien baru (Admin)',
    description:
      'Membuat tipe relasi baru yang dapat dipilih pasien saat registrasi/booking.',
  })
  @ApiCreatedResponse({ description: 'Tipe relasi pasien berhasil dibuat' })
  async createRelationship(
    @Body(zodPipe(CreateFacilityRelationshipSchema))
    body: CreateFacilityRelationshipInput,
  ) {
    return this.facilitiesService.createRelationship(body);
  }

  @Patch('relationships/:id')
  @ApiOperation({
    summary: 'Memperbarui master data tipe relasi pasien (Admin)',
    description:
      'Mengubah nama, kode, deskripsi, ikon, urutan, atau status relasi.',
  })
  @ApiParam({ name: 'id', description: 'ID unik tipe relasi pasien' })
  @ApiOkResponse({ description: 'Tipe relasi pasien berhasil diperbarui' })
  async updateRelationship(
    @Param(zodPipe(FacilityRelationshipParamSchema))
    param: FacilityRelationshipParamInput,
    @Body(zodPipe(UpdateFacilityRelationshipSchema))
    body: UpdateFacilityRelationshipInput,
  ) {
    return this.facilitiesService.updateRelationship(param.id, body);
  }

  @Patch('relationships/:id/default')
  @ApiOperation({
    summary: 'Menjadikan tipe relasi sebagai relasi utama sistem / default (Admin)',
    description:
      'Menetapkan satu relasi sebagai relasi sistem (Akun Utama) dan menonaktifkan status sistem pada relasi lainnya secara transaksional.',
  })
  @ApiParam({ name: 'id', description: 'ID unik tipe relasi pasien' })
  @ApiOkResponse({ description: 'Relasi berhasil ditetapkan sebagai default sistem' })
  async setDefaultRelationship(
    @Param(zodPipe(FacilityRelationshipParamSchema))
    param: FacilityRelationshipParamInput,
  ) {
    return this.facilitiesService.setDefaultRelationship(param.id);
  }

  @Delete('relationships/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus permanen master tipe relasi pasien (Admin)',
    description:
      'Menghapus fisik tipe relasi jika bukan relasi sistem dan tidak digunakan.',
  })
  @ApiParam({ name: 'id', description: 'ID unik tipe relasi pasien' })
  @ApiNoContentResponse({
    description: 'Tipe relasi berhasil dihapus permanen',
  })
  async deleteRelationship(
    @Param(zodPipe(FacilityRelationshipParamSchema))
    param: FacilityRelationshipParamInput,
  ) {
    await this.facilitiesService.deleteRelationship(param.id);
  }

  // ==========================================
  // 7. BULK FACILITY ACTIONS
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
