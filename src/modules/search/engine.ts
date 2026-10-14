import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import type { Catalog, SearchContext } from './catalog.types';

export interface SearchInput {
  q?: string;
  page: number;
  limit: number;
  sort?: {
    key: string;
    dir: 'asc' | 'desc';
  };
  filters: Record<string, unknown>;
}

export interface SearchResult<T = unknown> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Postgres LIKE escape function: escapes \, %, and _
 * Invariant INV-5: Whitelist and escape LIKE wildcards.
 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

/**
 * Tokenize search string into distinct words (max 6 tokens by default)
 */
export function tokenize(q: string, max = 6): string[] {
  return q.trim().split(/\s+/).filter(Boolean).slice(0, max);
}

/**
 * Invariant INV-1: AND across tokens, OR across fields.
 * If trimmed query is shorter than minLength, returns undefined (treated as empty).
 */
export function searchClause(cat: Catalog, q?: string): SQL | undefined {
  if (!q || q.trim().length < cat.search.minLength) {
    return undefined;
  }

  const tokens = tokenize(q);
  if (tokens.length === 0) {
    return undefined;
  }

  const tokenClauses: SQL[] = tokens.map((token) => {
    const escaped = escapeLike(token);
    const fieldClauses: SQL[] = cat.search.fields.map((field) => {
      if (field.kind === 'exact') {
        return sql`lower(${field.column}) = lower(${token})`;
      }
      if (field.kind === 'prefix') {
        return ilike(field.column, `${escaped}%`);
      }
      return ilike(field.column, `%${escaped}%`);
    });

    return or(...fieldClauses)!;
  });

  return and(...tokenClauses);
}

/**
 * Evaluates filter clauses based on catalog filter definitions.
 */
export function filterClauses(
  cat: Catalog,
  filters: Record<string, unknown>,
): SQL[] {
  const clauses: SQL[] = [];

  for (const [key, def] of Object.entries(cat.filters)) {
    const val = filters[key];
    if (val === undefined || val === null || val === '') {
      continue;
    }

    switch (def.type) {
      case 'enum': {
        if (typeof val === 'string' && def.values.includes(val)) {
          clauses.push(eq(def.column, val));
        } else if (Array.isArray(val)) {
          const valid = val.filter((item) => def.values.includes(item));
          if (valid.length === 1) {
            clauses.push(eq(def.column, valid[0]));
          } else if (valid.length > 1) {
            clauses.push(or(...valid.map((item) => eq(def.column, item)))!);
          }
        }
        break;
      }
      case 'boolean': {
        const boolVal =
          typeof val === 'boolean'
            ? val
            : val === 'true'
              ? true
              : val === 'false'
                ? false
                : undefined;
        if (boolVal !== undefined) {
          clauses.push(eq(def.column, boolVal));
        }
        break;
      }
      case 'range':
      case 'dateRange': {
        const range = val as
          | { from?: number | string | Date; to?: number | string | Date }
          | undefined;
        if (range?.from !== undefined && range.from !== '') {
          clauses.push(gte(def.column, range.from as any));
        }
        if (range?.to !== undefined && range.to !== '') {
          clauses.push(lte(def.column, range.to as any));
        }
        break;
      }
    }
  }

  return clauses;
}

/**
 * Generic Engine Query Runner
 * Invariants:
 * - INV-1: scope -> search -> filters -> sort -> count -> slice (LIMIT/OFFSET)
 * - INV-2: count uses identical WHERE as data query
 * - INV-4: ORDER BY always ends with unique tiebreaker
 */
export async function runSearch<T = any>(
  db: DrizzleDatabase,
  cat: Catalog,
  input: SearchInput,
  ctx: SearchContext = {},
): Promise<SearchResult<T>> {
  // 1) WHERE — scope, search, filters. Built once, reused for data AND count (INV-2).
  const conditions = [
    cat.scope?.(ctx),
    searchClause(cat, input.q),
    ...filterClauses(cat, input.filters),
  ].filter((c): c is SQL => Boolean(c));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // 2) ORDER BY — whitelisted sort + unique tiebreaker (INV-4).
  const sortKey =
    input.sort?.key && cat.sorts[input.sort.key]
      ? input.sort.key
      : cat.defaultSort.key;
  const sortDir =
    input.sort?.key && cat.sorts[input.sort.key]
      ? input.sort.dir
      : cat.defaultSort.dir;
  const sortCol = cat.sorts[sortKey];

  const orderBy = [
    sortDir === 'asc' ? asc(sortCol) : desc(sortCol),
    asc(cat.tiebreaker),
  ];

  // 3) LIMIT/OFFSET — applied last (INV-1).
  const limit = Math.min(
    input.limit || cat.pagination.defaultLimit,
    cat.pagination.maxLimit,
  );
  const offset = (Math.max(1, input.page) - 1) * limit;

  const [dataRows, countRows] = await Promise.all([
    (db as any)
      .select(cat.select)
      .from(cat.table)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    (db as any)
      .select({ total: count() })
      .from(cat.table)
      .where(where),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    data: dataRows as T[],
    meta: {
      page: input.page,
      limit,
      total,
      totalPages,
    },
  };
}
