import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import {
  MAIL_DEFAULTS,
  MAIL_PROVIDER_NAME,
} from '../../common/constants/mail.constants';
import { AllConfigType } from '../../config/config.type';
import { MailDeliveryError } from '../errors/mail-delivery.error';
import type { MailTransporterPort } from '../ports/mail-transporter.port';
import type { MailSentResult } from '../types/mail-sent-result.type';
import type { SendMailPayload } from '../types/send-mail-payload.type';

@Injectable()
export class SmtpMailAdapter implements MailTransporterPort {
  private readonly logger = new Logger(SmtpMailAdapter.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
    const user = this.configService.get('mail.user', { infer: true });
    const pass = this.configService.get('mail.password', { infer: true });
    const auth = user && pass ? { user, pass } : undefined;

    this.transporter = nodemailer.createTransport({
      host:
        this.configService.get('mail.host', { infer: true }) ||
        MAIL_DEFAULTS.FALLBACK_HOST,
      port:
        this.configService.get('mail.port', { infer: true }) ||
        MAIL_DEFAULTS.FALLBACK_PORT,
      ignoreTLS: this.configService.get('mail.ignoreTLS', { infer: true }),
      secure: this.configService.get('mail.secure', { infer: true }),
      requireTLS: this.configService.get('mail.requireTLS', { infer: true }),
      ...(auth ? { auth } : {}),
    });
  }

  async send(payload: SendMailPayload): Promise<MailSentResult> {
    const defaultFrom = `"${
      this.configService.get('mail.defaultName', {
        infer: true,
      }) || MAIL_DEFAULTS.APP_NAME
    }" <${
      this.configService.get('mail.defaultEmail', {
        infer: true,
      }) || MAIL_DEFAULTS.NOREPLY_EMAIL
    }>`;

    const from = payload.from || defaultFrom;
    const to = Array.isArray(payload.to) ? payload.to.join(', ') : payload.to;

    try {
      const info = await this.transporter.sendMail({
        from,
        to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html ?? payload.text,
        replyTo: payload.replyTo,
      });

      this.logger.log(
        `[${MAIL_PROVIDER_NAME.SMTP}] Email '${payload.subject}' successfully dispatched to ${to} (Message ID: ${info.messageId})`,
      );

      return {
        messageId: info.messageId,
      };
    } catch (error) {
      this.logger.error(
        `[${MAIL_PROVIDER_NAME.SMTP}] Failed to dispatch email to ${to}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new MailDeliveryError(
        error instanceof Error ? error.message : String(error),
        MAIL_PROVIDER_NAME.SMTP,
        error,
      );
    }
  }
}
