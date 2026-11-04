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
import { GetAllBloodTypesUseCase } from '../domain/use-cases/get-all-blood-types.use-case';
import { CreateBloodTypeUseCase } from '../domain/use-cases/create-blood-type.use-case';
import { UpdateBloodTypeUseCase } from '../domain/use-cases/update-blood-type.use-case';
import { DeleteBloodTypeUseCase } from '../domain/use-cases/delete-blood-type.use-case';
import {
  CreateBloodTypeInput,
  CreateBloodTypeSchema,
  UpdateBloodTypeInput,
  UpdateBloodTypeSchema,
} from './schemas/blood-type.schema';

@ApiTags('Master Demographic: Blood Types')
@Controller({ path: 'admin/facilities/blood-types', version: '1' })
@UseGuards(HybridAuthGuard, PermissionsGuard)
@RequirePermissions('clinics:manage')
@ApiBearerAuth('access-token')
export class BloodTypesAdminController {
  constructor(
    private readonly getAllUseCase: GetAllBloodTypesUseCase,
    private readonly createUseCase: CreateBloodTypeUseCase,
    private readonly updateUseCase: UpdateBloodTypeUseCase,
    private readonly deleteUseCase: DeleteBloodTypeUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Mendapatkan seluruh master golongan darah (Admin)' })
  async findAll(@Query('search') search?: string, @Query('status') status?: string) {
    const activeOnly = status === 'active';
    const list = await this.getAllUseCase.execute({ activeOnly, search });
    return { success: true, data: list };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Membuat master golongan darah baru (Admin)' })
  async create(@Body(zodPipe(CreateBloodTypeSchema)) body: CreateBloodTypeInput) {
    const item = await this.createUseCase.execute(body);
    return { success: true, data: item };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update master golongan darah (Admin)' })
  async update(
    @Param('id') id: string,
    @Body(zodPipe(UpdateBloodTypeSchema)) body: UpdateBloodTypeInput,
  ) {
    const item = await this.updateUseCase.execute(id, body);
    return { success: true, data: item };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hapus master golongan darah (Admin)' })
  async delete(@Param('id') id: string) {
    await this.deleteUseCase.execute(id);
  }
}
