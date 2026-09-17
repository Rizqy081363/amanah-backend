import fs from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Handlebars from 'handlebars';
import nodemailer from 'nodemailer';
import { AllConfigType } from '../config/config.type';

@Injectable()
export class MailerService {
  private readonly transporter: nodemailer.Transporter;
  constructor(private readonly configService: ConfigService<AllConfigType>) {
    const user = configService.get('mail.user', { infer: true });
    const pass = configService.get('mail.password', { infer: true });
    const auth = user && pass ? { user, pass } : undefined;

    this.transporter = nodemailer.createTransport({
      host: configService.get('mail.host', { infer: true }) || 'localhost',
      port: configService.get('mail.port', { infer: true }) || 1025,
      ignoreTLS: configService.get('mail.ignoreTLS', { infer: true }),
      secure: configService.get('mail.secure', { infer: true }),
      requireTLS: configService.get('mail.requireTLS', { infer: true }),
      ...(auth ? { auth } : {}),
    });
  }

  async sendMail({
    templatePath,
    context,
    ...mailOptions
  }: nodemailer.SendMailOptions & {
    templatePath?: string;
    context?: Record<string, unknown>;
  }): Promise<void> {
    let html = mailOptions.html as string | undefined;
    if (templatePath) {
      const template = await fs.readFile(templatePath, 'utf-8');
      html = Handlebars.compile(template, {
        strict: false,
      })(context || {});
    }

    await this.transporter.sendMail({
      ...mailOptions,
      from: mailOptions.from
        ? mailOptions.from
        : `"${this.configService.get('mail.defaultName', {
            infer: true,
          })}" <${this.configService.get('mail.defaultEmail', {
            infer: true,
          })}>`,
      html: html ?? mailOptions.text,
    });
  }
}
