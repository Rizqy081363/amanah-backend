/**
 * DB Atlas - Inferred Relationships & Missing FK Candidates Enricher (P7)
 * Never upgrades guesses to declared facts. Always assigns confidence and reason.
 */

import type { RelationFact, DeclaredRelationship, InferredRelationship } from '../core/types';

export class InferredRelationshipsEnricher {
  static enrich(
    relations: RelationFact[],
    declaredRels: DeclaredRelationship[],
    conventions: string[]
  ): InferredRelationship[] {
    const tableMap = new Map<string, RelationFact>();
    for (const r of relations) {
      tableMap.set(r.name.toLowerCase(), r);
      // Singular alias: e.g. "appointments" -> "appointment"
      if (r.name.endsWith('s')) {
        tableMap.set(r.name.slice(0, -1).toLowerCase(), r);
      }
      if (r.name.endsWith('es')) {
        tableMap.set(r.name.slice(0, -2).toLowerCase(), r);
      }
    }

    const declaredSet = new Set(
      declaredRels.map((r) => `${r.fromTable}.${r.fromColumns.join(',')}`)
    );

    const inferred: InferredRelationship[] = [];

    for (const rel of relations) {
      for (const col of rel.columns) {
        // Abaikan jika kolom adalah primary key
        if (col.name === 'id') continue;

        // Abaikan jika kolom sudah memiliki foreign key deklaratif
        const signature = `${rel.qualifiedName}.${col.name}`;
        if (declaredSet.has(signature)) continue;

        // Cek pola nama yang menyerupai reference: *_id atau *_uuid
        const match = col.name.match(/^([a-z0-9_]+)_(id|uuid)$/i);
        if (!match) continue;

        const candidatePrefix = match[1].toLowerCase();
        const targetRel = tableMap.get(candidatePrefix);

        if (targetRel && targetRel.qualifiedName !== rel.qualifiedName) {
          const targetPk = targetRel.columns.find((c) => c.name === 'id');
          const typeMatch = targetPk && targetPk.dataType === col.dataType;

          // Cek apakah ada index pendukung
          const hasIndex = rel.indexes.some((idx) => idx.columns[0] === col.name);

          let confidence = 0.6;
          let reason = `Kolom '${col.name}' merujuk pada tabel '${targetRel.qualifiedName}' berdasarkan konvensi penamaan`;

          if (typeMatch) {
            confidence += 0.2;
            reason += ' dan kecocokan tipe data PK';
          }
          if (hasIndex) {
            confidence += 0.1;
            reason += ' serta memiliki indeks pendukung';
          }

          inferred.push({
            provenance: 'inferred',
            fromTable: rel.qualifiedName,
            fromColumn: col.name,
            toTable: targetRel.qualifiedName,
            toColumn: 'id',
            confidence: Number(confidence.toFixed(2)),
            reason,
            cardinality: 'one-to-many',
          });
        }

        // Cek pola polymorphic: jika ada pasangan _type dan _id
        const polyTypeCol = rel.columns.find((c) => c.name === `${candidatePrefix}_type`);
        if (polyTypeCol) {
          inferred.push({
            provenance: 'inferred',
            fromTable: rel.qualifiedName,
            fromColumn: col.name,
            toTable: `[Polymorphic: ditentukan oleh ${polyTypeCol.name}]`,
            toColumn: 'id',
            confidence: 0.4,
            reason: `Pola polimorfik terdeteksi (${polyTypeCol.name} + ${col.name}). Tidak dapat di-join secara deklaratif murni.`,
            cardinality: 'one-to-many',
            isPolymorphic: true,
          });
        }
      }
    }

    return inferred;
  }
}
