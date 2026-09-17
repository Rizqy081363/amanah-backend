import fs from 'node:fs/promises';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../config/config.type';
import { MailerService } from '../mailer/mailer.service';
import { MailData } from './interfaces/mail-data.interface';

export type SendMailOptions<T = Record<string, unknown>> = {
  to: string | string[];
  subject: string;
  template?: string;
  data?: T;
  text?: string;
  html?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async send<T = Record<string, unknown>>(
    options: SendMailOptions<T>,
  ): Promise<void> {
    const { to, subject, template, data = {} as T, text, html } = options;

    let templatePath: string | undefined;
    if (template) {
      const templateFileName = template.endsWith('.hbs')
        ? template
        : `${template}.hbs`;

      const workingDir =
        this.configService.get('app.workingDirectory', { infer: true }) ||
        process.cwd();

      const possiblePaths = [
        path.join(
          workingDir,
          'src',
          'mail',
          'mail-templates',
          templateFileName,
        ),
        path.join(
          workingDir,
          'dist',
          'mail',
          'mail-templates',
          templateFileName,
        ),
        path.join(__dirname, 'mail-templates', templateFileName),
      ];

      for (const p of possiblePaths) {
        try {
          await fs.access(p);
          templatePath = p;
          break;
        } catch {
          // try next path
        }
      }

      if (!templatePath) {
        templatePath = possiblePaths[0];
      }
    }

    const appName =
      this.configService.get('app.name', { infer: true }) ||
      'Amanah Healthcare';

    const context = {
      app_name: appName,
      title: subject,
      actionTitle: subject,
      ...(typeof data === 'object' && data !== null ? data : {}),
    };

    try {
      await this.mailerService.sendMail({
        to,
        subject,
        text,
        html,
        templatePath,
        context,
      });
      this.logger.log(
        `Email '${subject}' dispatched successfully to: ${Array.isArray(to) ? to.join(', ') : to}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send email '${subject}' to ${Array.isArray(to) ? to.join(', ') : to}:`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async userSignUp(mailData: MailData<{ hash: string }>): Promise<void> {
    const emailConfirmTitle = 'Confirm email';
    const text1 = 'Hey!';
    const text2 = 'You’re almost ready to start enjoying';
    const text3 =
      'Simply click the big green button below to verify your email address.';

    const url = new URL(
      this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      }) + '/confirm-email',
    );
    url.searchParams.set('hash', mailData.data.hash);

    await this.send({
      to: mailData.to,
      subject: emailConfirmTitle,
      template: 'activation',
      text: `${url.toString()} ${emailConfirmTitle}`,
      data: {
        title: emailConfirmTitle,
        url: url.toString(),
        verificationUrl: url.toString(),
        actionTitle: emailConfirmTitle,
        text1,
        text2,
        text3,
      },
    });
  }

  async forgotPassword(
    mailData: MailData<{ hash: string; tokenExpires: number }>,
  ): Promise<void> {
    const resetPasswordTitle = 'Reset password';
    const text1 = 'Trouble signing in?';
    const text2 = 'Resetting your password is easy.';
    const text3 =
      'Just press the button below and follow the instructions. We’ll have you up and running in no time.';
    const text4 =
      'If you did not make this request then please ignore this email.';

    const url = new URL(
      this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      }) + '/password-change',
    );
    url.searchParams.set('hash', mailData.data.hash);
    url.searchParams.set('expires', mailData.data.tokenExpires.toString());

    await this.send({
      to: mailData.to,
      subject: resetPasswordTitle,
      template: 'reset-password',
      text: `${url.toString()} ${resetPasswordTitle}`,
      data: {
        title: resetPasswordTitle,
        url: url.toString(),
        actionTitle: resetPasswordTitle,
        text1,
        text2,
        text3,
        text4,
      },
    });
  }

  async confirmNewEmail(mailData: MailData<{ hash: string }>): Promise<void> {
    const emailConfirmTitle = 'Confirm email';
    const text1 = 'Hey!';
    const text2 = 'Confirm your new email address.';
    const text3 =
      'Simply click the big green button below to verify your email address.';

    const url = new URL(
      this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      }) + '/confirm-new-email',
    );
    url.searchParams.set('hash', mailData.data.hash);

    await this.send({
      to: mailData.to,
      subject: emailConfirmTitle,
      template: 'confirm-new-email',
      text: `${url.toString()} ${emailConfirmTitle}`,
      data: {
        title: emailConfirmTitle,
        url: url.toString(),
        actionTitle: emailConfirmTitle,
        text1,
        text2,
        text3,
      },
    });
  }
}
