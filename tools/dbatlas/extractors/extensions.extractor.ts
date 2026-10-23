import type { ExtensionFact } from '../core/types';
import type { CatalogExtractor, ExtractorContext } from './extractor.interface';

export class ExtensionsExtractor implements CatalogExtractor<ExtensionFact[]> {
  public name = 'extensions';

  async extract(ctx: ExtractorContext): Promise<ExtensionFact[]> {
    const sql = `
      SELECT coalesce(json_agg(json_build_object(
        'name', e.extname,
        'version', e.extversion,
        'schema', n.nspname
      ) ORDER BY e.extname), '[]'::json) AS extensions
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace;
    `;

    const res = await ctx.transport.queryJson<ExtensionFact[]>(sql);
    return res || [];
  }
}
