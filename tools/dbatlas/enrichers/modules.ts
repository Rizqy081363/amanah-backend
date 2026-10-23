/**
 * DB Atlas - Domain Modules Clustering Enricher
 * Groups tables into cohesive domain modules so no single ERD exceeds ~25 entities.
 */

import type { RelationFact } from '../core/types';

export class ModulesEnricher {
  static enrich(
    relations: RelationFact[],
    overrides: Record<string, string[]> = {}
  ): { modules: { name: string; tables: string[] }[]; relationModuleMap: Map<string, string> } {
    const relationModuleMap = new Map<string, string>();

    // 1. Terapkan manual overrides dari config jika ada
    const moduleTablesMap = new Map<string, Set<string>>();
    for (const [modName, tableList] of Object.entries(overrides)) {
      if (!moduleTablesMap.has(modName)) moduleTablesMap.set(modName, new Set());
      for (const t of tableList) {
        moduleTablesMap.get(modName)!.add(t);
        relationModuleMap.set(t, modName);
      }
    }

    // 2. Default domain prefixes untuk pengelompokan otomatis
    const prefixRules: [RegExp, string][] = [
      [/^(users?|roles?|permissions?|auth_|sessions?|tokens?)/i, 'auth_identity'],
      [/^(appointments?|schedules?|rosters?|queues?|doctor_schedule)/i, 'scheduling_appointments'],
      [/^(patients?|encounters?|clinical_|medical_|diagnos|allerg)/i, 'patient_clinical'],
      [/^(staff_|doctors?|midwives?|workers?|attendances?|leave_)/i, 'staff_management'],
      [/^(chats?|conversations?|messages?|notifications?|support_)/i, 'communication_chat'],
      [/^(billing|invoices?|payments?|tarifs?|fees?|salaries?|payrolls?)/i, 'finance_billing'],
      [/^(pharmacy|medicines?|drugs?|prescriptions?|stocks?|inventory)/i, 'pharmacy_inventory'],
      [/^(clinics?|rooms?|departments?|polikliniks?|units?)/i, 'clinic_facility'],
      [/^(data_exports?|outbox|audit_|logs?|settings?|files?)/i, 'system_infrastructure'],
    ];

    for (const rel of relations) {
      if (relationModuleMap.has(rel.qualifiedName) || relationModuleMap.has(rel.name)) {
        continue;
      }

      let assignedModule = 'general_core';
      for (const [regex, modName] of prefixRules) {
        if (regex.test(rel.name)) {
          assignedModule = modName;
          break;
        }
      }

      relationModuleMap.set(rel.qualifiedName, assignedModule);
      if (!moduleTablesMap.has(assignedModule)) {
        moduleTablesMap.set(assignedModule, new Set());
      }
      moduleTablesMap.get(assignedModule)!.add(rel.qualifiedName);
    }

    const modules = Array.from(moduleTablesMap.entries())
      .map(([name, set]) => ({
        name,
        tables: Array.from(set).sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { modules, relationModuleMap };
  }
}
