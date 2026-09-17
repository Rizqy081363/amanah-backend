import { All, Controller, Req, Res, VERSION_NEUTRAL } from '@nestjs/common';
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
  @All()
  async handleRoot(@Req() req: Request, @Res() res: Response) {
    return toNodeHandler(auth)(req, res);
  }

  @All('*')
  async handleWildcard(@Req() req: Request, @Res() res: Response) {
    return toNodeHandler(auth)(req, res);
  }
}
