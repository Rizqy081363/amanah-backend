import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type CreateEmailOptions, Resend } from 'resend';
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
export class ResendMailAdapter implements MailTransporterPort {
  private readonly logger = new Logger(ResendMailAdapter.name);
  private readonly client: Resend;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
    const apiKey = this.configService.get('mail.resendApiKey', { infer: true });
    if (!apiKey) {
      throw new Error(
        `[${MAIL_PROVIDER_NAME.RESEND}] RESEND_API_KEY is not defined in environment. Cannot initialize Resend client.`,
      );
    }
    this.client = new Resend(apiKey);
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
    const to = Array.isArray(payload.to) ? payload.to : [payload.to];

    const baseOptions = {
      from,
      to,
      subject: payload.subject,
      ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
    };

    const sendOptions: CreateEmailOptions = payload.html
      ? {
          ...baseOptions,
          html: payload.html,
          ...(payload.text ? { text: payload.text } : {}),
        }
      : {
          ...baseOptions,
          text: payload.text || payload.subject,
        };

    try {
      const { data, error } = await this.client.emails.send(sendOptions);

      if (error) {
        this.logger.error(
          `[${MAIL_PROVIDER_NAME.RESEND}] Delivery rejected for ${to.join(', ')}: [${error.name}] ${error.message}`,
        );
        throw new MailDeliveryError(
          error.message,
          MAIL_PROVIDER_NAME.RESEND,
          error,
        );
      }

      const messageId = data?.id ?? '';
      this.logger.log(
        `[${MAIL_PROVIDER_NAME.RESEND}] Email '${payload.subject}' successfully dispatched to ${to.join(', ')} (Resend ID: ${messageId})`,
      );

      return {
        messageId,
      };
    } catch (err) {
      if (err instanceof MailDeliveryError) {
        throw err;
      }
      const errMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[${MAIL_PROVIDER_NAME.RESEND}] Unexpected transport failure for ${to.join(', ')}: ${errMessage}`,
      );
      throw new MailDeliveryError(errMessage, MAIL_PROVIDER_NAME.RESEND, err);
    }
  }
}
