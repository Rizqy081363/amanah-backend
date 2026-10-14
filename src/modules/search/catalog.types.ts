import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

export type SearchKind =
  | 'text' // Substring match: ILIKE '%term%' (needs trigram GIN index)
  | 'prefix' // Starts-with match: ILIKE 'term%' (trigram or btree on lower(col))
  | 'exact'; // Case-insensitive eq: lower(col) = lower(term)

export interface SearchField {
  column: AnyPgColumn;
  kind: SearchKind;
  weight?: number;
}

export type FilterDef =
  | { type: 'enum'; column: AnyPgColumn; values: readonly string[] }
  | { type: 'boolean'; column: AnyPgColumn }
  | { type: 'range'; column: AnyPgColumn }
  | { type: 'dateRange'; column: AnyPgColumn };

export interface SearchContext {
  userId?: string;
  tenantId?: string;
  roles?: string[];
}

export interface Catalog {
  key: string;
  table: PgTable;
  id: AnyPgColumn;
  select: Record<string, AnyPgColumn | SQL>;
  search: {
    fields: SearchField[];
    minLength: number;
  };
  filters: Record<string, FilterDef>;
  sorts: Record<string, AnyPgColumn>;
  defaultSort: {
    key: string;
    dir: 'asc' | 'desc';
  };
  tiebreaker: AnyPgColumn;
  pagination: {
    defaultLimit: number;
    maxLimit: number;
  };
  scope?: (ctx: SearchContext) => SQL | undefined;
}

export const defineCatalog = <T extends Catalog>(c: T): T => c;
