import { Module } from '@nestjs/common';
import { UserRepository } from '../user.repository';
import { UsersDrizzleRepository } from './repositories/user.repository';

@Module({
  providers: [
    {
      provide: UserRepository,
      useClass: UsersDrizzleRepository,
    },
  ],
  exports: [UserRepository],
})
export class DrizzleUserPersistenceModule {}
