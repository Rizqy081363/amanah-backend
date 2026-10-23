import type { TriggerFact } from '../core/types';
import type { CatalogExtractor, ExtractorContext } from './extractor.interface';

export interface RelationTriggersMap {
  [qualifiedTableName: string]: TriggerFact[];
}

export class TriggersExtractor implements CatalogExtractor<RelationTriggersMap> {
  public name = 'triggers';

  async extract(ctx: ExtractorContext): Promise<RelationTriggersMap> {
    const sql = `
      SELECT coalesce(json_object_agg(t.tbl, t.trg_list), '{}'::json) AS triggers_map
      FROM (
        SELECT 
          concat(n.nspname, '.', c.relname) AS tbl,
          json_agg(json_build_object(
            'name', trg.tgname,
            'timing', CASE trg.tgtype & 66
              WHEN 2 THEN 'BEFORE'
              WHEN 64 THEN 'INSTEAD OF'
              ELSE 'AFTER'
            END,
            'events', (
              SELECT json_agg(ev.name)
              FROM (
                SELECT 'INSERT' AS name WHERE trg.tgtype & 4 <> 0
                UNION ALL
                SELECT 'DELETE' WHERE trg.tgtype & 8 <> 0
                UNION ALL
                SELECT 'UPDATE' WHERE trg.tgtype & 16 <> 0
                UNION ALL
                SELECT 'TRUNCATE' WHERE trg.tgtype & 32 <> 0
              ) ev
            ),
            'functionName', p.proname,
            'definition', pg_get_triggerdef(trg.oid)
          ) ORDER BY trg.tgname) AS trg_list
        FROM pg_trigger trg
        JOIN pg_class c ON c.oid = trg.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = trg.tgfoid
        WHERE NOT trg.tgisinternal
          AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle')
        GROUP BY n.nspname, c.relname
      ) t;
    `;

    const res = await ctx.transport.queryJson<RelationTriggersMap>(sql);
    return res || {};
  }
}
