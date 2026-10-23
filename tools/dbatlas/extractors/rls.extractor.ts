import type { RlsPolicyFact } from '../core/types';
import type { CatalogExtractor, ExtractorContext } from './extractor.interface';

export interface RelationRlsMap {
  [qualifiedTableName: string]: RlsPolicyFact[];
}

export class RlsExtractor implements CatalogExtractor<RelationRlsMap> {
  public name = 'rls';

  async extract(ctx: ExtractorContext): Promise<RelationRlsMap> {
    const sql = `
      SELECT coalesce(json_object_agg(t.tbl, t.pol_list), '{}'::json) AS rls_map
      FROM (
        SELECT 
          concat(n.nspname, '.', c.relname) AS tbl,
          json_agg(json_build_object(
            'name', pol.polname,
            'command', CASE pol.polcmd
              WHEN 'r' THEN 'SELECT'
              WHEN 'a' THEN 'INSERT'
              WHEN 'w' THEN 'UPDATE'
              WHEN 'd' THEN 'DELETE'
              ELSE 'ALL'
            END,
            'roles', (
              SELECT json_agg(r.rolname)
              FROM pg_roles r
              WHERE r.oid = ANY(pol.polroles)
            ),
            'qual', pg_get_expr(pol.polqual, pol.polrelid),
            'withCheck', pg_get_expr(pol.polwithcheck, pol.polrelid)
          ) ORDER BY pol.polname) AS pol_list
        FROM pg_policy pol
        JOIN pg_class c ON c.oid = pol.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle')
        GROUP BY n.nspname, c.relname
      ) t;
    `;

    const res = await ctx.transport.queryJson<RelationRlsMap>(sql);
    return res || {};
  }
}
