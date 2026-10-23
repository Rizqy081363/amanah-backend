/**
 * DB Atlas - Extractor Base Interface
 */

import type { DatabaseTransport } from '../transport/transport.interface';
import type { SchemaScopeConfig } from '../config/config.interface';

export interface ExtractorContext {
  transport: DatabaseTransport;
  schemas: SchemaScopeConfig;
}

export interface CatalogExtractor<T> {
  name: string;
  extract(ctx: ExtractorContext): Promise<T>;
}
