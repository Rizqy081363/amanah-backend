import type { CatalogExtractor, ExtractorContext } from './extractor.interface';

export class SchemasExtractor implements CatalogExtractor<string[]> {
  public name = 'schemas';

  async extract(ctx: ExtractorContext): Promise<string[]> {
    const sql = `
      SELECT coalesce(json_agg(nspname ORDER BY nspname), '[]'::json) AS schemas
      FROM pg_namespace
      WHERE nspname NOT LIKE 'pg_%'
        AND nspname != 'information_schema'
        AND nspname NOT IN ('drizzle');
    `;
    const res = await ctx.transport.queryJson<string[]>(sql);
    return res || ['public'];
  }
}
