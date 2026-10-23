import type { ConstraintFact, ConstraintType } from '../core/types';
import type { CatalogExtractor, ExtractorContext } from './extractor.interface';

export interface RelationConstraintsMap {
  [qualifiedTableName: string]: ConstraintFact[];
}

export class ConstraintsExtractor implements CatalogExtractor<RelationConstraintsMap> {
  public name = 'constraints';

  async extract(ctx: ExtractorContext): Promise<RelationConstraintsMap> {
    const sql = `
      SELECT coalesce(json_object_agg(t.tbl, t.con_list), '{}'::json) AS constraints_map
      FROM (
        SELECT 
          concat(n.nspname, '.', c.relname) AS tbl,
          json_agg(json_build_object(
            'name', con.conname,
            'type', CASE con.contype
              WHEN 'p' THEN 'PRIMARY KEY'
              WHEN 'f' THEN 'FOREIGN KEY'
              WHEN 'u' THEN 'UNIQUE'
              WHEN 'c' THEN 'CHECK'
              WHEN 'x' THEN 'EXCLUDE'
              ELSE 'CHECK'
            END,
            'definition', pg_get_constraintdef(con.oid),
            'columns', coalesce((
              SELECT json_agg(att.attname ORDER BY u.ord)
              FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
              JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
            ), '[]'::json),
            'foreignTable', CASE WHEN con.contype = 'f' THEN (
              SELECT concat(fn.nspname, '.', fc.relname)
              FROM pg_class fc
              JOIN pg_namespace fn ON fn.oid = fc.relnamespace
              WHERE fc.oid = con.confrelid
            ) ELSE NULL END,
            'foreignColumns', CASE WHEN con.contype = 'f' THEN (
              SELECT json_agg(fatt.attname ORDER BY fu.ord)
              FROM unnest(con.confkey) WITH ORDINALITY AS fu(attnum, ord)
              JOIN pg_attribute fatt ON fatt.attrelid = con.confrelid AND fatt.attnum = fu.attnum
            ) ELSE NULL END,
            'onUpdate', CASE con.confupdtype
              WHEN 'a' THEN 'NO ACTION'
              WHEN 'r' THEN 'RESTRICT'
              WHEN 'c' THEN 'CASCADE'
              WHEN 'n' THEN 'SET NULL'
              WHEN 'd' THEN 'SET DEFAULT'
              ELSE NULL
            END,
            'onDelete', CASE con.confdeltype
              WHEN 'a' THEN 'NO ACTION'
              WHEN 'r' THEN 'RESTRICT'
              WHEN 'c' THEN 'CASCADE'
              WHEN 'n' THEN 'SET NULL'
              WHEN 'd' THEN 'SET DEFAULT'
              ELSE NULL
            END,
            'isDeferrable', con.condeferrable
          ) ORDER BY con.contype, con.conname) AS con_list
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle')
        GROUP BY n.nspname, c.relname
      ) t;
    `;

    const res = await ctx.transport.queryJson<RelationConstraintsMap>(sql);
    return res || {};
  }
}
