/**
 * DB Atlas - Catalog Extractor Orchestration Service
 * Coordinates all catalog extractors inside a consistent snapshot transaction.
 */

import type { DatabaseTransport } from '../transport/transport.interface';
import type { SchemaScopeConfig } from '../config/config.interface';
import type { RelationFact, EnumFact, ExtensionFact, TelemetryFact } from '../core/types';
import { SchemasExtractor } from './schemas.extractor';
import { EnumsExtractor } from './enums.extractor';
import { RelationsExtractor } from './relations.extractor';
import { ConstraintsExtractor } from './constraints.extractor';
import { IndexesExtractor } from './indexes.extractor';
import { TriggersExtractor } from './triggers.extractor';
import { RlsExtractor } from './rls.extractor';
import { ExtensionsExtractor } from './extensions.extractor';
import { TelemetryExtractor } from './telemetry.extractor';

export interface RawExtractionResult {
  schemas: string[];
  relations: RelationFact[];
  enums: EnumFact[];
  extensions: ExtensionFact[];
  telemetry: TelemetryFact[];
}

export class CatalogExtractorService {
  constructor(
    private readonly transport: DatabaseTransport,
    private readonly schemasConfig: SchemaScopeConfig
  ) {}

  async extractAll(): Promise<RawExtractionResult> {
    const ctx = {
      transport: this.transport,
      schemas: this.schemasConfig,
    };

    // 1. Ekstraksi fakta independen
    const schemas = await new SchemasExtractor().extract(ctx);
    const enums = await new EnumsExtractor().extract(ctx);
    const extensions = await new ExtensionsExtractor().extract(ctx);
    const telemetry = await new TelemetryExtractor().extract(ctx);

    // 2. Ekstraksi relasi dan atribut anak
    const rawRelations = await new RelationsExtractor().extract(ctx);
    const constraintsMap = await new ConstraintsExtractor().extract(ctx);
    const indexesMap = await new IndexesExtractor().extract(ctx);
    const triggersMap = await new TriggersExtractor().extract(ctx);
    const rlsMap = await new RlsExtractor().extract(ctx);

    // 3. Merging struktur ke dalam RelationFact kanonik
    const relations: RelationFact[] = rawRelations.map((r) => {
      const qName = r.qualifiedName;
      return {
        ...r,
        constraints: constraintsMap[qName] || [],
        indexes: indexesMap[qName] || [],
        triggers: triggersMap[qName] || [],
        rlsPolicies: rlsMap[qName] || [],
      };
    });

    return {
      schemas,
      relations,
      enums,
      extensions,
      telemetry,
    };
  }
}
