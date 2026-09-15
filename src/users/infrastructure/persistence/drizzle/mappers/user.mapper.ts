import { User } from '../../../../domain/user';
import {
  UserSelect,
  FileSelect,
  RoleSelect,
  StatusSelect,
} from '../../../../../database/schema';
import { FileMapper } from '../../../../../files/infrastructure/persistence/drizzle/mappers/file.mapper';
import { Role } from '../../../../../roles/domain/role';
import { Status } from '../../../../../statuses/domain/status';

export type RawUser = UserSelect & {
  photo?: FileSelect | null;
  role?: RoleSelect | null;
  status?: StatusSelect | null;
};

export class UserMapper {
  static toDomain(raw: RawUser): User {
    const domainEntity = new User();
    domainEntity.id = raw.id;
    domainEntity.email = raw.email;
    domainEntity.password = raw.password ?? undefined;
    domainEntity.provider = raw.provider;
    domainEntity.socialId = raw.socialId;
    domainEntity.firstName = raw.firstName;
    domainEntity.lastName = raw.lastName;

    if (raw.photo) {
      domainEntity.photo = FileMapper.toDomain(raw.photo);
    } else if (raw.photo === null) {
      domainEntity.photo = null;
    }

    if (raw.role) {
      const role = new Role();
      role.id = raw.role.id;
      role.name = raw.role.name ?? undefined;
      domainEntity.role = role;
    }

    if (raw.status) {
      const status = new Status();
      status.id = raw.status.id;
      status.name = raw.status.name ?? undefined;
      domainEntity.status = status;
    }

    domainEntity.createdAt = raw.createdAt;
    domainEntity.updatedAt = raw.updatedAt;
    domainEntity.deletedAt = raw.deletedAt as unknown as Date;
    return domainEntity;
  }
}
