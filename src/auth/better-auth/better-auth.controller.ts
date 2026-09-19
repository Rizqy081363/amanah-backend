import {
  All,
  Controller,
  Get,
  Query,
  Req,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import { auth } from './auth';

@ApiExcludeController()
@Controller({
  path: 'auth',
  version: VERSION_NEUTRAL,
})
export class BetterAuthController {
  @Get('sign-in/social')
  async handleSocialGet(
    @Query('provider') provider: string = 'google',
    @Query('callbackURL') callbackURL: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const targetCallbackUrl =
      callbackURL ||
      process.env.FRONTEND_DOMAIN ||
      'http://localhost:3000/dashboard';

    const result = await auth.api.signInSocial({
      body: {
        provider: (provider || 'google') as 'google',
        callbackURL: targetCallbackUrl,
      },
      headers: req.headers as Record<string, string>,
      asResponse: true,
    });

    result.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const body = (await result.json()) as { url?: string };
    if (body?.url) {
      return res.redirect(body.url);
    }

    return res.status(result.status).send(body);
  }

  @All()
  async handleRoot(@Req() req: Request, @Res() res: Response) {
    return toNodeHandler(auth)(req, res);
  }

  @All('*')
  async handleWildcard(@Req() req: Request, @Res() res: Response) {
    return toNodeHandler(auth)(req, res);
  }
}
