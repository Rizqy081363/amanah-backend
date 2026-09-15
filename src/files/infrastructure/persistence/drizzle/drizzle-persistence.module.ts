import { Module } from '@nestjs/common';
import { FileRepository } from '../file.repository';
import { FileDrizzleRepository } from './repositories/file.repository';

@Module({
  providers: [
    {
      provide: FileRepository,
      useClass: FileDrizzleRepository,
    },
  ],
  exports: [FileRepository],
})
export class DrizzleFilePersistenceModule {}
