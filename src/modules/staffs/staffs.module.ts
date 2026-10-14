import { Module } from '@nestjs/common';
import { CryptoPasswordGeneratorService } from '../../common/services/crypto-password-generator.service';
import { PASSWORD_GENERATOR_TOKEN } from '../../common/services/password-generator.interface';
import { MailModule } from '../../mail/mail.module';
import { AvatarModule } from '../avatar/avatar.module';
import { StaffInvitationService } from './application/staff-invitation.service';
import { STAFF_REPOSITORY } from './domain/repositories/staff.repository';
import { STAFF_INVITATION_REPOSITORY } from './domain/repositories/staff-invitation.repository';
import { STAFF_ROSTER_REPOSITORY } from './domain/repositories/staff-roster.repository';
import { StaffDrizzleRepository } from './infrastructure/drizzle/staff.drizzle-repository';
import { StaffInvitationDrizzleRepository } from './infrastructure/drizzle/staff-invitation.drizzle-repository';
import { StaffRosterDrizzleRepository } from './infrastructure/drizzle/staff-roster.drizzle-repository';
import { AdminInvitationsController } from './presentation/admin-invitations.controller';
import { StaffsController } from './presentation/staffs.controller';

@Module({
  imports: [AvatarModule, MailModule],
  controllers: [StaffsController, AdminInvitationsController],
  providers: [
    {
      provide: STAFF_REPOSITORY,
      useClass: StaffDrizzleRepository,
    },
    {
      provide: STAFF_INVITATION_REPOSITORY,
      useClass: StaffInvitationDrizzleRepository,
    },
    {
      provide: STAFF_ROSTER_REPOSITORY,
      useClass: StaffRosterDrizzleRepository,
    },
    {
      provide: PASSWORD_GENERATOR_TOKEN,
      useClass: CryptoPasswordGeneratorService,
    },
    StaffInvitationService,
  ],
  exports: [
    STAFF_REPOSITORY,
    STAFF_INVITATION_REPOSITORY,
    STAFF_ROSTER_REPOSITORY,
    StaffInvitationService,
  ],
})
export class StaffsModule {}
