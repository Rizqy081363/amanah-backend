import fs from 'node:fs/promises';
import { Inject, Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import {
  MAIL_TRANSPORTER,
  type MailTransporterPort,
} from './ports/mail-transporter.port';
import type { MailSentResult } from './types/mail-sent-result.type';
import type { MailerSendMailOptions } from './types/mailer-send-options.type';

@Injectable()
export class MailerService {
  constructor(
    @Inject(MAIL_TRANSPORTER)
    private readonly mailTransporter: MailTransporterPort,
  ) {}

  async sendMail({
    templatePath,
    context,
    ...mailOptions
  }: MailerSendMailOptions): Promise<MailSentResult> {
    let html = mailOptions.html;
    if (templatePath) {
      const template = await fs.readFile(templatePath, 'utf-8');
      html = Handlebars.compile(template, {
        strict: false,
      })(context || {});
    }

    const to = Array.isArray(mailOptions.to)
      ? mailOptions.to.map((item) =>
          typeof item === 'string' ? item : item.address,
        )
      : typeof mailOptions.to === 'string'
        ? mailOptions.to
        : mailOptions.to?.address || '';

    const resolveAddress = (
      input?:
        | string
        | { address: string; name?: string }
        | Array<string | { address: string; name?: string }>,
    ): string | undefined => {
      if (!input) return undefined;
      if (typeof input === 'string') return input;
      if (Array.isArray(input)) {
        return input
          .map((item) => (typeof item === 'string' ? item : item.address))
          .join(', ');
      }
      return input.address;
    };

    const from = resolveAddress(mailOptions.from);
    const replyTo = resolveAddress(mailOptions.replyTo);

    return this.mailTransporter.send({
      to,
      from,
      subject: mailOptions.subject || '',
      text: typeof mailOptions.text === 'string' ? mailOptions.text : undefined,
      html:
        html ??
        (typeof mailOptions.text === 'string' ? mailOptions.text : undefined),
      replyTo,
    });
  }
}
