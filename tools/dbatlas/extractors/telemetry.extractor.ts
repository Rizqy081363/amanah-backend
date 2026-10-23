import type { TelemetryFact } from '../core/types';
import type { CatalogExtractor, ExtractorContext } from './extractor.interface';

export class TelemetryExtractor implements CatalogExtractor<TelemetryFact[]> {
  public name = 'telemetry';

  async extract(ctx: ExtractorContext): Promise<TelemetryFact[]> {
    const sql = `
      SELECT coalesce(json_agg(json_build_object(
        'table', concat(n.nspname, '.', c.relname),
        'estimatedRows', CASE WHEN c.reltuples < 0 THEN -1 ELSE c.reltuples::bigint END,
        'totalSizeBytes', pg_total_relation_size(c.oid),
        'tableSizeBytes', pg_relation_size(c.oid),
        'indexesSizeBytes', pg_indexes_size(c.oid)
      ) ORDER BY n.nspname, c.relname), '[]'::json) AS telemetry
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p', 'm')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle');
    `;

    const res = await ctx.transport.queryJson<TelemetryFact[]>(sql);
    return res || [];
  }
}
