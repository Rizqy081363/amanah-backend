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
import { GetAllReligionsUseCase } from '../domain/use-cases/get-all-religions.use-case';
import { CreateReligionUseCase } from '../domain/use-cases/create-religion.use-case';
import { UpdateReligionUseCase } from '../domain/use-cases/update-religion.use-case';
import { DeleteReligionUseCase } from '../domain/use-cases/delete-religion.use-case';
import {
  CreateReligionInput,
  CreateReligionSchema,
  UpdateReligionInput,
  UpdateReligionSchema,
} from './schemas/religion.schema';

@ApiTags('Master Demographic: Religions')
@Controller({ path: 'admin/facilities/religions', version: '1' })
@UseGuards(HybridAuthGuard, PermissionsGuard)
@RequirePermissions('clinics:manage')
@ApiBearerAuth('access-token')
export class ReligionsAdminController {
  constructor(
    private readonly getAllUseCase: GetAllReligionsUseCase,
    private readonly createUseCase: CreateReligionUseCase,
    private readonly updateUseCase: UpdateReligionUseCase,
    private readonly deleteUseCase: DeleteReligionUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Mendapatkan seluruh master data agama (Admin)' })
  async findAll(@Query('search') search?: string, @Query('status') status?: string) {
    const activeOnly = status === 'active';
    const list = await this.getAllUseCase.execute({ activeOnly, search });
    return { success: true, data: list };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Membuat master data agama baru (Admin)' })
  async create(@Body(zodPipe(CreateReligionSchema)) body: CreateReligionInput) {
    const item = await this.createUseCase.execute(body);
    return { success: true, data: item };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update master data agama (Admin)' })
  async update(
    @Param('id') id: string,
    @Body(zodPipe(UpdateReligionSchema)) body: UpdateReligionInput,
  ) {
    const item = await this.updateUseCase.execute(id, body);
    return { success: true, data: item };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hapus master data agama (Admin)' })
  async delete(@Param('id') id: string) {
    await this.deleteUseCase.execute(id);
  }
}
