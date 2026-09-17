import { AuthConfig } from '../auth/config/auth-config.type';
import { CacheConfig } from '../cache/cache-config.type';
import { DatabaseConfig } from '../database/config/database-config.type';
import { FileConfig } from '../files/config/file-config.type';
import { MailConfig } from '../mail/config/mail-config.type';
import { AppConfig } from './app-config.type';

export type AllConfigType = {
  app: AppConfig;
  auth: AuthConfig;
  cache: CacheConfig;
  database: DatabaseConfig;
  file: FileConfig;
  mail: MailConfig;
};
