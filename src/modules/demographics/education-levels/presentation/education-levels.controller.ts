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
import { GetAllEducationLevelsUseCase } from '../domain/use-cases/get-all-education-levels.use-case';
import { CreateEducationLevelUseCase } from '../domain/use-cases/create-education-level.use-case';
import { UpdateEducationLevelUseCase } from '../domain/use-cases/update-education-level.use-case';
import { DeleteEducationLevelUseCase } from '../domain/use-cases/delete-education-level.use-case';
import {
  CreateEducationLevelInput,
  CreateEducationLevelSchema,
  UpdateEducationLevelInput,
  UpdateEducationLevelSchema,
} from './schemas/education-level.schema';

@ApiTags('Master Demographic: Education Levels')
@Controller({ path: 'admin/facilities/education-levels', version: '1' })
@UseGuards(HybridAuthGuard, PermissionsGuard)
@RequirePermissions('clinics:manage')
@ApiBearerAuth('access-token')
export class EducationLevelsAdminController {
  constructor(
    private readonly getAllUseCase: GetAllEducationLevelsUseCase,
    private readonly createUseCase: CreateEducationLevelUseCase,
    private readonly updateUseCase: UpdateEducationLevelUseCase,
    private readonly deleteUseCase: DeleteEducationLevelUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Mendapatkan seluruh master jenjang pendidikan (Admin)' })
  async findAll(@Query('search') search?: string, @Query('status') status?: string) {
    const activeOnly = status === 'active';
    const list = await this.getAllUseCase.execute({ activeOnly, search });
    return { success: true, data: list };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Membuat master jenjang pendidikan baru (Admin)' })
  async create(@Body(zodPipe(CreateEducationLevelSchema)) body: CreateEducationLevelInput) {
    const item = await this.createUseCase.execute(body);
    return { success: true, data: item };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update master jenjang pendidikan (Admin)' })
  async update(
    @Param('id') id: string,
    @Body(zodPipe(UpdateEducationLevelSchema)) body: UpdateEducationLevelInput,
  ) {
    const item = await this.updateUseCase.execute(id, body);
    return { success: true, data: item };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hapus master jenjang pendidikan (Admin)' })
  async delete(@Param('id') id: string) {
    await this.deleteUseCase.execute(id);
  }
}
