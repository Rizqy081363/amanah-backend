import { Global, Module } from '@nestjs/common';
import { NikSecurityService } from './nik-security.service';

@Global()
@Module({
  providers: [NikSecurityService],
  exports: [NikSecurityService],
})
export class NikSecurityModule {}
