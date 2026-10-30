import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_DRIVER } from '../common/constants/mail.constants';
import { AllConfigType } from '../config/config.type';
import { ResendMailAdapter } from './adapters/resend-mail.adapter';
import { SmtpMailAdapter } from './adapters/smtp-mail.adapter';
import { MailerService } from './mailer.service';
import { MAIL_TRANSPORTER } from './ports/mail-transporter.port';

@Module({
  providers: [
    {
      provide: MAIL_TRANSPORTER,
      useFactory: (configService: ConfigService<AllConfigType>) => {
        const driver =
          configService.get('mail.driver', { infer: true }) || MAIL_DRIVER.SMTP;
        if (driver === MAIL_DRIVER.RESEND) {
          return new ResendMailAdapter(configService);
        }
        return new SmtpMailAdapter(configService);
      },
      inject: [ConfigService],
    },
    MailerService,
  ],
  exports: [MailerService, MAIL_TRANSPORTER],
})
export class MailerModule {}
