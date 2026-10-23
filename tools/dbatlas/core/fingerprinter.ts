/**
 * DB Atlas - Deterministic Fingerprinter & Drift Detection (P4 & P8)
 * Computes factsHash (for database drift detection) and atlasHash (for artifact integrity).
 */

import { createHash } from 'node:crypto';
import type { CanonicalAtlasModel, RelationFact, EnumFact } from './types';

export interface FingerprintResult {
  factsHash: string;
  atlasHash: string;
  schemaVersion: string;
  generatorVersion: string;
  target: string;
  generatedAt: string;
}

/**
 * Serialisasi objek secara deterministik dengan pengurutan kunci (key-sorting) yang stabil.
 */
function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${pairs.join(',')}}`;
}

export class DbAtlasFingerprinter {
  /**
   * Menghitung factsHash murni dari fakta katalog struktural (tanpa heuristik/telemetri/waktu).
   * Hanya berubah jika terjadi perubahan skema DDL riil pada PostgreSQL.
   */
  static computeFactsHash(relations: RelationFact[], enums: EnumFact[]): string {
    // Normalisasi struktur minimal yang menjadi penentu kebenaran skema
    const normalizedFacts = {
      relations: relations
        .slice()
        .sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName))
        .map((r) => ({
          name: r.qualifiedName,
          kind: r.kind,
          columns: r.columns.map((c) => ({
            name: c.name,
            type: c.dataType,
            null: c.isNullable,
            default: c.defaultValue ?? null,
          })),
          constraints: r.constraints.map((k) => ({
            name: k.name,
            type: k.type,
            cols: k.columns,
            def: k.definition,
          })),
          indexes: r.indexes.map((i) => ({
            name: i.name,
            unique: i.isUnique,
            primary: i.isPrimary,
            cols: i.columns,
            pred: i.predicate ?? null,
          })),
        })),
      enums: enums
        .slice()
        .sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName))
        .map((e) => ({
          name: e.qualifiedName,
          labels: e.labels,
        })),
    };

    const payload = stableStringify(normalizedFacts);
    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  /**
   * Menghitung atlasHash atas seluruh model kanonik stabil.
   */
  static computeAtlasHash(model: CanonicalAtlasModel): string {
    // Kecualikan atribut non-deterministik seperti generatedAt
    const { generatedAt: _, ...stableModel } = model;
    const payload = stableStringify(stableModel);
    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  /**
   * Menghasilkan objek fingerprint lengkap untuk FINGERPRINT.json.
   */
  static generateFingerprint(
    model: CanonicalAtlasModel,
    generatorVersion = '1.0.0'
  ): FingerprintResult {
    const factsHash = this.computeFactsHash(model.relations, model.enums);
    const atlasHash = this.computeAtlasHash(model);

    return {
      factsHash,
      atlasHash,
      schemaVersion: model.schemaVersion,
      generatorVersion,
      target: model.target,
      generatedAt: new Date().toISOString(),
    };
  }
}
