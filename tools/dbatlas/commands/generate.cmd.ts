/**
 * DB Atlas - Generate Command
 * Compiles live PostgreSQL catalog into the deterministic map.
 */

import { resolve } from 'node:path';
import type { DatabaseTransport } from '../transport/transport.interface';
import type { DbAtlasConfig, SensitivityRule } from '../config/config.interface';
import { CatalogExtractorService } from '../extractors/catalog-extractor.service';
import { RelationshipGraphEnricher } from '../enrichers/relationship-graph';
import { InferredRelationshipsEnricher } from '../enrichers/inferred-relationships';
import { ModulesEnricher } from '../enrichers/modules';
import { ConventionsEnricher } from '../enrichers/conventions';
import { SensitivityEnricher } from '../enrichers/sensitivity';
import { LintsEnricher } from '../enrichers/lints';
import { DbAtlasFingerprinter } from '../core/fingerprinter';
import { DbAtlasStore, type FilePayload } from '../core/store';
import { IndexMdRenderer } from '../renderers/index-md.renderer';
import { TableCardRenderer } from '../renderers/table-card.renderer';
import { EnumsMdRenderer } from '../renderers/enums-md.renderer';
import { MermaidRenderer } from '../renderers/mermaid.renderer';
import { InferredMdRenderer } from '../renderers/inferred-md.renderer';
import { LintsMdRenderer } from '../renderers/lints-md.renderer';
import { ProtocolMdRenderer } from '../renderers/protocol-md.renderer';
import type { CanonicalAtlasModel } from '../core/types';

export async function runGenerateCommand(
  transport: DatabaseTransport,
  config: DbAtlasConfig,
  sensitivityRules: SensitivityRule[],
  workspaceRoot: string
): Promise<number> {
  const startTime = Date.now();
  console.log('='.repeat(80));
  console.log(' DB ATLAS — COMPILING DATABASE CATALOG INTO MAP');
  console.log(` Target: ${config.target.label} | Transport: ${transport.name}`);
  console.log('='.repeat(80));

  // 1. Ekstraksi fakta katalog server-side
  console.log('\n[Fase 1/4] Mengekstraksi metadata katalog dari PostgreSQL...');
  const extractorService = new CatalogExtractorService(transport, config.schemas);
  const rawFacts = await extractorService.extractAll();
  console.log(`  ✓ Berhasil mengekstraksi ${rawFacts.relations.length} relasi/tabel dan ${rawFacts.enums.length} tipe enum.`);

  // 2. Pengayaan Domain & Heuristik
  console.log('\n[Fase 2/4] Menganalisis graf relasi, modul, konvensi, dan sensitivitas...');
  SensitivityEnricher.enrich(rawFacts.relations, sensitivityRules);
  const declaredRels = RelationshipGraphEnricher.enrich(rawFacts.relations, config.junction.maxExtraColumns);
  const inferredRels = InferredRelationshipsEnricher.enrich(rawFacts.relations, declaredRels, config.inference.namingConventions);
  const { modules, relationModuleMap } = ModulesEnricher.enrich(rawFacts.relations, config.modules.overrides);
  const conventions = ConventionsEnricher.enrich(rawFacts.relations);
  const lints = LintsEnricher.enrich(rawFacts.relations);

  for (const rel of rawFacts.relations) {
    rel.module = relationModuleMap.get(rel.qualifiedName) || 'general_core';
  }

  // 3. Bangun Canonical Model & Fingerprint
  console.log('\n[Fase 3/4] Membangun model kanonik & menghitung sidik jari (fingerprint)...');
  const canonicalModel: CanonicalAtlasModel = {
    schemaVersion: '1.0.0',
    target: config.target.label,
    schemas: rawFacts.schemas,
    relations: rawFacts.relations,
    enums: rawFacts.enums,
    extensions: rawFacts.extensions,
    relationships: {
      declared: declaredRels,
      inferred: inferredRels,
    },
    conventions,
    modules,
    lints,
  };

  const fingerprint = DbAtlasFingerprinter.generateFingerprint(canonicalModel);

  // 4. Render seluruh berkas
  console.log('\n[Fase 4/4] Merender artefak (Markdown, JSON, Mermaid) & atomic store swap...');
  const files: FilePayload[] = [];

  // Structure layer (committed)
  files.push({
    relativePath: 'atlas.json',
    content: JSON.stringify(canonicalModel, null, 2),
  });

  files.push({
    relativePath: 'FINGERPRINT.json',
    content: JSON.stringify(fingerprint, null, 2),
  });

  files.push({
    relativePath: 'INDEX.md',
    content: IndexMdRenderer.render(canonicalModel),
  });

  files.push({
    relativePath: 'enums.md',
    content: EnumsMdRenderer.render(rawFacts.enums),
  });

  files.push({
    relativePath: 'inferred.md',
    content: InferredMdRenderer.render(inferredRels),
  });

  files.push({
    relativePath: 'lints.md',
    content: LintsMdRenderer.render(lints),
  });

  files.push({
    relativePath: 'PROTOCOL.md',
    content: ProtocolMdRenderer.render(),
  });

  // Table cards
  for (const rel of rawFacts.relations) {
    files.push({
      relativePath: `tables/${rel.qualifiedName}.md`,
      content: TableCardRenderer.render(rel, declaredRels, rawFacts.enums),
    });
  }

  // Mermaid diagrams
  files.push({
    relativePath: 'relationships.mmd',
    content: MermaidRenderer.renderErDiagram(rawFacts.relations, declaredRels),
  });

  const moduleDiagrams = MermaidRenderer.renderModuleDiagrams(rawFacts.relations, declaredRels, modules);
  for (const [modName, mmd] of moduleDiagrams.entries()) {
    files.push({
      relativePath: `modules/${modName}.mmd`,
      content: mmd,
    });
  }

  // Volatile telemetry layer (git-ignored)
  files.push({
    relativePath: 'telemetry.json',
    content: JSON.stringify(rawFacts.telemetry, null, 2),
  });

  const targetOutDir = resolve(workspaceRoot, config.output.dir || 'db-atlas');
  DbAtlasStore.atomicWrite(targetOutDir, files);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n' + '='.repeat(80));
  console.log(' KOMPILASI DB ATLAS SELESAI DENGAN SUKSES');
  console.log('='.repeat(80));
  console.log(` Output Folder   : ${targetOutDir}`);
  console.log(` Total File      : ${files.length} berkas tersimpan secara atomik`);
  console.log(` Facts Hash      : ${fingerprint.factsHash}`);
  console.log(` Atlas Hash      : ${fingerprint.atlasHash}`);
  console.log(` Durasi Eksekusi : ${durationSec} detik`);
  console.log('='.repeat(80));

  return 0;
}
