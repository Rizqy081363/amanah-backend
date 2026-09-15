import { FileType } from '../../../../domain/file';
import { FileSelect } from '../../../../../database/schema';

export class FileMapper {
  static toDomain(raw: FileSelect): FileType {
    const domainEntity = new FileType();
    domainEntity.id = raw.id;
    domainEntity.path = raw.path;
    return domainEntity;
  }
}
