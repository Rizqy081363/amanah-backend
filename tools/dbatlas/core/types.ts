/**
 * DB Atlas - Canonical Model Types & Contracts (P1, P4, P7)
 * Single Source of Truth for database structure and derived intelligence.
 */

export type ObjectKind = 'table' | 'view' | 'materialized_view' | 'partitioned_table' | 'foreign_table';
export type ConstraintType = 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK' | 'EXCLUDE';
export type CardinalityType = 'one-to-one' | 'one-to-many' | 'many-to-many' | 'hierarchy';
export type FactProvenance = 'declared' | 'inferred';
export type ColumnSensitivity = 'phi' | 'pii' | 'credential' | 'financial' | 'none';

export interface ColumnFact {
  ordinal: number;
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string | null;
  isGenerated?: boolean;
  isIdentity?: boolean;
  comment?: string | null;
  enumType?: string | null;
  sensitivity?: ColumnSensitivity;
  sensitivityReason?: string;
}

export interface ConstraintFact {
  name: string;
  type: ConstraintType;
  columns: string[];
  definition: string;
  // Foreign Key specifics
  foreignTable?: string;
  foreignColumns?: string[];
  onUpdate?: string;
  onDelete?: string;
  isDeferrable?: boolean;
}

export interface IndexFact {
  name: string;
  isUnique: boolean;
  isPrimary: boolean;
  isValid: boolean;
  accessMethod: string;
  definition: string;
  columns: string[];
  predicate?: string | null;
}

export interface TriggerFact {
  name: string;
  timing: string;
  events: string[];
  functionName: string;
  definition: string;
}

export interface RlsPolicyFact {
  name: string;
  command: string;
  roles: string[];
  qual?: string | null;
  withCheck?: string | null;
}

export interface RelationFact {
  schema: string;
  name: string;
  qualifiedName: string; // e.g. "public.appointments"
  kind: ObjectKind;
  comment?: string | null;
  columns: ColumnFact[];
  constraints: ConstraintFact[];
  indexes: IndexFact[];
  triggers: TriggerFact[];
  rlsPolicies: RlsPolicyFact[];
  isRlsEnabled: boolean;
  module?: string;
}

export interface EnumFact {
  schema: string;
  name: string;
  qualifiedName: string;
  labels: string[];
  usedByColumns: { table: string; column: string }[];
}

export interface ExtensionFact {
  name: string;
  version: string;
  schema: string;
}

export interface DeclaredRelationship {
  provenance: 'declared';
  name: string;
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
  cardinality: CardinalityType;
  isRequired: boolean; // false if fromColumns are nullable
  onDelete: string;
  onUpdate: string;
}

export interface InferredRelationship {
  provenance: 'inferred';
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  confidence: number; // 0 - 1
  reason: string;
  cardinality: CardinalityType;
  isPolymorphic?: boolean;
}

export interface JoinPathHop {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  cardinality: CardinalityType;
  isIndexed: boolean;
  fansOut: boolean;
}

export interface JoinPath {
  from: string;
  to: string;
  hops: JoinPathHop[];
  joinClauses: string[];
  hasFanOutWarning: boolean;
  unindexedForeignKeys: string[];
}

export interface SchemaLint {
  code: string;
  severity: 'warning' | 'info' | 'error';
  table: string;
  message: string;
  remediation: string;
}

export interface ConventionSummary {
  softDelete: {
    columnName: string;
    coveredTables: string[];
    missingTables: string[];
  };
  auditTimestamps: {
    createdAtColumn: string;
    updatedAtColumn: string;
    coveredTables: string[];
  };
  tenantScoping: {
    columnName: string;
    coveredTables: string[];
  };
  primaryKeyTypes: Record<string, number>;
}

export interface TelemetryFact {
  table: string;
  estimatedRows: number;
  totalSizeBytes: number;
  tableSizeBytes: number;
  indexesSizeBytes: number;
}

export interface CanonicalAtlasModel {
  schemaVersion: string;
  generatedAt?: string;
  target: string;
  schemas: string[];
  relations: RelationFact[];
  enums: EnumFact[];
  extensions: ExtensionFact[];
  relationships: {
    declared: DeclaredRelationship[];
    inferred: InferredRelationship[];
  };
  conventions: ConventionSummary;
  modules: { name: string; tables: string[] }[];
  lints: SchemaLint[];
}
