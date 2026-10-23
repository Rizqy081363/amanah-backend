/**
 * DB Atlas - Join Paths Engine (Dijkstra Shortest Paths)
 * Computes safe join routes with fan-out warnings and ready SQL clauses.
 */

import type { DeclaredRelationship, JoinPath, JoinPathHop, RelationFact } from '../core/types';

interface GraphEdge {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-many' | 'hierarchy';
  isIndexed: boolean;
  weight: number;
}

export class JoinPathsEnricher {
  static computePaths(
    fromTable: string,
    toTable: string,
    declaredRels: DeclaredRelationship[],
    relations: RelationFact[],
    maxPaths = 3
  ): JoinPath[] {
    const tableMap = new Map<string, RelationFact>();
    for (const r of relations) {
      tableMap.set(r.qualifiedName, r);
      tableMap.set(r.name, r);
    }

    const normFrom = tableMap.get(fromTable)?.qualifiedName || fromTable;
    const normTo = tableMap.get(toTable)?.qualifiedName || toTable;

    if (normFrom === normTo) return [];

    // 1. Bangun adjacency list graf
    const adj = new Map<string, GraphEdge[]>();
    const addEdge = (node: string, edge: GraphEdge) => {
      if (!adj.has(node)) adj.set(node, []);
      adj.get(node)!.push(edge);
    };

    for (const rel of declaredRels) {
      const fromFact = tableMap.get(rel.fromTable);
      const isIndexed = fromFact
        ? fromFact.indexes.some((idx) =>
            rel.fromColumns.every((c) => idx.columns.includes(c))
          )
        : false;

      // Arah Outgoing: Child -> Parent (Many-to-One, tidak fan-out)
      addEdge(rel.fromTable, {
        fromTable: rel.fromTable,
        fromColumn: rel.fromColumns[0] || 'id',
        toTable: rel.toTable,
        toColumn: rel.toColumns[0] || 'id',
        cardinality: rel.cardinality,
        isIndexed,
        weight: isIndexed ? 1 : 2,
      });

      // Arah Incoming: Parent -> Child (One-to-Many, berpotensi fan-out!)
      addEdge(rel.toTable, {
        fromTable: rel.toTable,
        fromColumn: rel.toColumns[0] || 'id',
        toTable: rel.fromTable,
        toColumn: rel.fromColumns[0] || 'id',
        cardinality: rel.cardinality,
        isIndexed,
        weight: isIndexed ? 3 : 5, // Lebih berat karena berisiko fan-out
      });
    }

    // 2. BFS / Dijkstra untuk menemukan k-shortest paths
    const paths: JoinPath[] = [];
    const queue: { current: string; hops: GraphEdge[]; visited: Set<string> }[] = [
      { current: normFrom, hops: [], visited: new Set([normFrom]) },
    ];

    while (queue.length > 0 && paths.length < maxPaths) {
      const { current, hops, visited } = queue.shift()!;

      if (current === normTo && hops.length > 0) {
        const joinHops: JoinPathHop[] = hops.map((h) => ({
          fromTable: h.fromTable,
          fromColumn: h.fromColumn,
          toTable: h.toTable,
          toColumn: h.toColumn,
          cardinality: h.cardinality,
          isIndexed: h.isIndexed,
          fansOut: h.fromColumn === 'id' && h.toColumn !== 'id', // Parent join ke child berpotensi fan out
        }));

        const joinClauses: string[] = hops.map(
          (h) => `JOIN ${h.toTable} ON ${h.toTable}.${h.toColumn} = ${h.fromTable}.${h.fromColumn}`
        );

        const hasFanOut = joinHops.some((h) => h.fansOut);
        const unindexed = joinHops
          .filter((h) => !h.isIndexed)
          .map((h) => `${h.fromTable}.${h.fromColumn} (FK tanpa indeks pendukung)`);

        paths.push({
          from: normFrom,
          to: normTo,
          hops: joinHops,
          joinClauses,
          hasFanOutWarning: hasFanOut,
          unindexedForeignKeys: unindexed,
        });
        continue;
      }

      const neighbors = adj.get(current) || [];
      for (const edge of neighbors) {
        if (!visited.has(edge.toTable)) {
          const nextVisited = new Set(visited);
          nextVisited.add(edge.toTable);
          queue.push({
            current: edge.toTable,
            hops: [...hops, edge],
            visited: nextVisited,
          });
        }
      }
    }

    return paths;
  }
}
