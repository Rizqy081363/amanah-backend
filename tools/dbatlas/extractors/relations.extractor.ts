import type { RelationFact, ColumnFact, ObjectKind } from '../core/types';
import type { CatalogExtractor, ExtractorContext } from './extractor.interface';

export class RelationsExtractor implements CatalogExtractor<Omit<RelationFact, 'constraints' | 'indexes' | 'triggers' | 'rlsPolicies'>[]> {
  public name = 'relations';

  async extract(ctx: ExtractorContext): Promise<Omit<RelationFact, 'constraints' | 'indexes' | 'triggers' | 'rlsPolicies'>[]> {
    const includeSchemas = ctx.schemas.include && ctx.schemas.include.length > 0
      ? ctx.schemas.include.map((s) => `'${s}'`).join(',')
      : "'public'";

    const sql = `
      WITH columns_agg AS (
        SELECT 
          a.attrelid,
          json_agg(json_build_object(
            'ordinal', a.attnum,
            'name', a.attname,
            'dataType', format_type(a.atttypid, a.atttypmod),
            'isNullable', NOT a.attnotnull,
            'defaultValue', pg_get_expr(ad.adbin, ad.adrelid),
            'isGenerated', a.attgenerated != '',
            'isIdentity', a.attidentity != '',
            'comment', col_desc.description,
            'enumType', CASE WHEN t.typtype = 'e' THEN t.typname ELSE NULL END
          ) ORDER BY a.attnum) AS columns
        FROM pg_attribute a
        LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        LEFT JOIN pg_type t ON t.oid = a.atttypid
        LEFT JOIN pg_description col_desc ON col_desc.objoid = a.attrelid AND col_desc.objsubid = a.attnum
        WHERE a.attnum > 0 AND NOT a.attisdropped
        GROUP BY a.attrelid
      )
      SELECT coalesce(json_agg(json_build_object(
        'schema', n.nspname,
        'name', c.relname,
        'qualifiedName', concat(n.nspname, '.', c.relname),
        'kind', CASE c.relkind
          WHEN 'r' THEN 'table'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'materialized_view'
          WHEN 'p' THEN 'partitioned_table'
          WHEN 'f' THEN 'foreign_table'
          ELSE 'table'
        END,
        'comment', obj_desc.description,
        'isRlsEnabled', c.relrowsecurity,
        'columns', coalesce(ca.columns, '[]'::json)
      ) ORDER BY n.nspname, c.relname), '[]'::json) AS relations
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN columns_agg ca ON ca.attrelid = c.oid
      LEFT JOIN pg_description obj_desc ON obj_desc.objoid = c.oid AND obj_desc.objsubid = 0
      WHERE n.nspname IN (${includeSchemas})
        AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle');
    `;

    const res = await ctx.transport.queryJson<Omit<RelationFact, 'constraints' | 'indexes' | 'triggers' | 'rlsPolicies'>[]>(sql);
    return res || [];
  }
}
