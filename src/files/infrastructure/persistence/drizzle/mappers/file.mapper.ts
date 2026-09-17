import { FileSelect } from '../../../../../database/schema';
import { FileType } from '../../../../domain/file';

export class FileMapper {
  static toDomain(raw: FileSelect): FileType {
    const domainEntity = new FileType();
    domainEntity.id = raw.id;
    domainEntity.path = raw.path;
    return domainEntity;
  }
}
