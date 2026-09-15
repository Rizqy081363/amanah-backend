import { Session } from '../../../../domain/session';
import {
  SessionSelect,
  UserSelect,
  FileSelect,
  RoleSelect,
  StatusSelect,
} from '../../../../../database/schema';
import { UserMapper } from '../../../../../users/infrastructure/persistence/drizzle/mappers/user.mapper';

export type RawSession = SessionSelect & {
  user?: (UserSelect & {
    photo?: FileSelect | null;
    role?: RoleSelect | null;
    status?: StatusSelect | null;
  }) | null;
};

export class SessionMapper {
  static toDomain(raw: RawSession): Session {
    const domainEntity = new Session();
    domainEntity.id = raw.id;
    if (raw.user) {
      domainEntity.user = UserMapper.toDomain(raw.user);
    }
    domainEntity.hash = raw.hash;
    domainEntity.createdAt = raw.createdAt;
    domainEntity.updatedAt = raw.updatedAt;
    domainEntity.deletedAt = raw.deletedAt as unknown as Date;
    return domainEntity;
  }
}
