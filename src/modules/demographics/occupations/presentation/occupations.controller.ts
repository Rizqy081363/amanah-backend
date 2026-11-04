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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HybridAuthGuard,
  PermissionsGuard,
  RequirePermissions,
} from '../../../../common/auth';
import { zodPipe } from '../../../../common/validation';
import { GetAllOccupationsUseCase } from '../domain/use-cases/get-all-occupations.use-case';
import { CreateOccupationUseCase } from '../domain/use-cases/create-occupation.use-case';
import { UpdateOccupationUseCase } from '../domain/use-cases/update-occupation.use-case';
import { DeleteOccupationUseCase } from '../domain/use-cases/delete-occupation.use-case';
import {
  CreateOccupationInput,
  CreateOccupationSchema,
  UpdateOccupationInput,
  UpdateOccupationSchema,
} from './schemas/occupation.schema';

@ApiTags('Master Demographic: Occupations')
@Controller({ path: 'admin/facilities/occupations', version: '1' })
@UseGuards(HybridAuthGuard, PermissionsGuard)
@RequirePermissions('clinics:manage')
@ApiBearerAuth('access-token')
export class OccupationsAdminController {
  constructor(
    private readonly getAllUseCase: GetAllOccupationsUseCase,
    private readonly createUseCase: CreateOccupationUseCase,
    private readonly updateUseCase: UpdateOccupationUseCase,
    private readonly deleteUseCase: DeleteOccupationUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Mendapatkan seluruh master pekerjaan (Admin)' })
  async findAll(@Query('search') search?: string, @Query('status') status?: string) {
    const activeOnly = status === 'active';
    const list = await this.getAllUseCase.execute({ activeOnly, search });
    return { success: true, data: list };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Membuat master pekerjaan baru (Admin)' })
  async create(@Body(zodPipe(CreateOccupationSchema)) body: CreateOccupationInput) {
    const item = await this.createUseCase.execute(body);
    return { success: true, data: item };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update master pekerjaan (Admin)' })
  async update(
    @Param('id') id: string,
    @Body(zodPipe(UpdateOccupationSchema)) body: UpdateOccupationInput,
  ) {
    const item = await this.updateUseCase.execute(id, body);
    return { success: true, data: item };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hapus master pekerjaan (Admin)' })
  async delete(@Param('id') id: string) {
    await this.deleteUseCase.execute(id);
  }
}
