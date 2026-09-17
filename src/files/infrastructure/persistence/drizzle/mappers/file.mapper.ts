import { files } from '../../../../../database/schema';
import { FileType } from '../../../../domain/file';

type FileSelect = typeof files.$inferSelect;

export class FileMapper {
  static toDomain(raw: FileSelect): FileType {
    const domainEntity = new FileType();
    domainEntity.id = raw.id;
    domainEntity.path = raw.storageKey;
    return domainEntity;
  }
}
