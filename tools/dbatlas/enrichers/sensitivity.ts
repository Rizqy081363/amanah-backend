/**
 * DB Atlas - Sensitivity Classifier Enricher (P3)
 * Rule-based classification for PHI, PII, Credential, and Financial metadata.
 */

import type { SensitivityRule } from '../config/config.interface';
import type { RelationFact, ColumnSensitivity } from '../core/types';

export class SensitivityEnricher {
  static enrich(relations: RelationFact[], rules: SensitivityRule[]): void {
    const compiledRules = rules.map((r) => ({
      ...r,
      regex: r.isRegex ? new RegExp(r.pattern, 'i') : new RegExp(`\\b${r.pattern}\\b`, 'i'),
    }));

    for (const rel of relations) {
      for (const col of rel.columns) {
        let matchedSensitivity: ColumnSensitivity = 'none';
        let matchedReason: string | undefined;

        for (const rule of compiledRules) {
          if (rule.regex.test(col.name) || (col.comment && rule.regex.test(col.comment))) {
            matchedSensitivity = rule.sensitivity;
            matchedReason = rule.reason;
            break;
          }
        }

        // Fail-safe heuristic: kolom bertipe 'text' pada tabel klinis/pasien tanpa tag diberi perhatian
        if (
          matchedSensitivity === 'none' &&
          col.dataType === 'text' &&
          /patient|clinical|medical|encounter|doctor|consult/i.test(rel.name) &&
          !/id|code|status|type/i.test(col.name)
        ) {
          matchedSensitivity = 'phi';
          matchedReason = 'Teks bebas pada tabel klinis (berpotensi memuat catatan medis/PHI)';
        }

        col.sensitivity = matchedSensitivity;
        col.sensitivityReason = matchedReason;
      }
    }
  }
}
