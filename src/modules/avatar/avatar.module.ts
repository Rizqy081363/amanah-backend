import { Module } from '@nestjs/common';
import { LocalAvatarStorageAdapter } from './adapters/local-avatar-storage.adapter';
import { AvatarProcessingService } from './avatar-processing.service';
import { AvatarSvgService } from './avatar-svg.service';
import { AvatarController } from './avatar.controller';
import { AvatarService } from './avatar.service';
import { AVATAR_STORAGE_PORT } from './ports/avatar-storage.port';

@Module({
  controllers: [AvatarController],
  providers: [
    AvatarProcessingService,
    AvatarSvgService,
    AvatarService,
    {
      provide: AVATAR_STORAGE_PORT,
      useClass: LocalAvatarStorageAdapter,
    },
  ],
  exports: [AvatarService, AvatarSvgService, AVATAR_STORAGE_PORT],
})
export class AvatarModule {}
