import type { IndexFact } from '../core/types';
import type { CatalogExtractor, ExtractorContext } from './extractor.interface';

export interface RelationIndexesMap {
  [qualifiedTableName: string]: IndexFact[];
}

export class IndexesExtractor implements CatalogExtractor<RelationIndexesMap> {
  public name = 'indexes';

  async extract(ctx: ExtractorContext): Promise<RelationIndexesMap> {
    const sql = `
      SELECT coalesce(json_object_agg(t.tbl, t.idx_list), '{}'::json) AS indexes_map
      FROM (
        SELECT 
          concat(tbl_ns.nspname, '.', tbl.relname) AS tbl,
          json_agg(json_build_object(
            'name', idx.relname,
            'isUnique', i.indisunique,
            'isPrimary', i.indisprimary,
            'isValid', i.indisvalid,
            'accessMethod', am.amname,
            'definition', pg_get_indexdef(idx.oid),
            'columns', coalesce((
              SELECT json_agg(att.attname ORDER BY u.ord)
              FROM unnest(i.indkey) WITH ORDINALITY AS u(attnum, ord)
              JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = u.attnum
            ), '[]'::json),
            'predicate', pg_get_expr(i.indpred, i.indrelid)
          ) ORDER BY idx.relname) AS idx_list
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_class tbl ON tbl.oid = i.indrelid
        JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
        JOIN pg_am am ON am.oid = idx.relam
        WHERE tbl_ns.nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle')
        GROUP BY tbl_ns.nspname, tbl.relname
      ) t;
    `;

    const res = await ctx.transport.queryJson<RelationIndexesMap>(sql);
    return res || {};
  }
}
