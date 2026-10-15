import { Injectable } from '@nestjs/common';
import { OptionalHybridAuthGuard } from '../../../../common/auth/optional-hybrid-auth.guard';

@Injectable()
export class OptionalJwtAuthGuard extends OptionalHybridAuthGuard {}
export { OptionalHybridAuthGuard };
