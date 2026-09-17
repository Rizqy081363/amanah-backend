import { Injectable } from '@nestjs/common';
import { NullableType } from '../utils/types/nullable.type';
import { FileType } from './domain/file';
import { FileRepository } from './infrastructure/persistence/file.repository';

@Injectable()
export class FilesService {
  constructor(private readonly fileRepository: FileRepository) {}

  findById(id: FileType['id']): Promise<NullableType<FileType>> {
    return this.fileRepository.findById(id);
  }

  findByIds(ids: FileType['id'][]): Promise<FileType[]> {
    return this.fileRepository.findByIds(ids);
  }
}
