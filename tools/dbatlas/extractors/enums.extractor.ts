import type { EnumFact } from '../core/types';
import type { CatalogExtractor, ExtractorContext } from './extractor.interface';

export class EnumsExtractor implements CatalogExtractor<EnumFact[]> {
  public name = 'enums';

  async extract(ctx: ExtractorContext): Promise<EnumFact[]> {
    const sql = `
      WITH enum_types AS (
        SELECT 
          t.oid AS type_oid,
          n.nspname AS schema_name,
          t.typname AS enum_name,
          json_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname != 'information_schema'
        GROUP BY t.oid, n.nspname, t.typname
      ),
      enum_usage AS (
        SELECT 
          a.atttypid AS type_oid,
          json_agg(json_build_object(
            'table', concat(tbl_ns.nspname, '.', c.relname),
            'column', a.attname
          ) ORDER BY tbl_ns.nspname, c.relname, a.attname) AS usages
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace tbl_ns ON tbl_ns.oid = c.relnamespace
        WHERE a.attnum > 0 AND NOT a.attisdropped
        GROUP BY a.atttypid
      )
      SELECT coalesce(json_agg(json_build_object(
        'schema', et.schema_name,
        'name', et.enum_name,
        'qualifiedName', concat(et.schema_name, '.', et.enum_name),
        'labels', et.labels,
        'usedByColumns', coalesce(eu.usages, '[]'::json)
      ) ORDER BY et.schema_name, et.enum_name), '[]'::json) AS enums
      FROM enum_types et
      LEFT JOIN enum_usage eu ON eu.type_oid = et.type_oid;
    `;

    const res = await ctx.transport.queryJson<EnumFact[]>(sql);
    return res || [];
  }
}
