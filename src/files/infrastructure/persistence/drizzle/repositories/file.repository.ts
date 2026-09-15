import { Injectable, Inject } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { FileRepository } from '../../file.repository';
import { FileType } from '../../../../domain/file';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import { files } from '../../../../../database/schema';
import { FileMapper } from '../mappers/file.mapper';

@Injectable()
export class FileDrizzleRepository implements FileRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async create(data: FileType): Promise<FileType> {
    const [record] = await this.db
      .insert(files)
      .values({
        id: data.id,
        path: data.path,
      })
      .returning();

    return FileMapper.toDomain(record);
  }

  async findById(id: FileType['id']): Promise<NullableType<FileType>> {
    const record = await this.db.query.files.findFirst({
      where: eq(files.id, id),
    });

    return record ? FileMapper.toDomain(record) : null;
  }

  async findByIds(ids: FileType['id'][]): Promise<FileType[]> {
    if (!ids.length) return [];
    const records = await this.db.query.files.findMany({
      where: inArray(files.id, ids),
    });

    return records.map((record) => FileMapper.toDomain(record));
  }
}
