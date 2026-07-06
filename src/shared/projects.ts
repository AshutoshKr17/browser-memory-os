import { db } from './db';
import type { PageMemory, Project } from './types';
import { centroid, cosineSimilarity } from './vector';

/**
 * Greedy single-pass clustering of memories into "projects".
 * A project is a set of pages that are semantically close AND/OR share
 * domains — e.g. GitHub + Jira + AWS docs => "Infrastructure Migration".
 */

const SIM_THRESHOLD = 0.55;

interface Cluster {
  centroid: number[];
  members: PageMemory[];
  domains: Set<string>;
}

function nameCluster(cluster: Cluster): string {
  // Frequency of keywords across members, ignoring generic ones.
  const freq = new Map<string, number>();
  for (const m of cluster.members) {
    for (const k of m.keywords) freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k[0].toUpperCase() + k.slice(1));
  if (top.length) return top.join(' · ');
  const domains = [...cluster.domains].slice(0, 2);
  return domains.join(' · ') || 'Untitled Project';
}

export async function reclusterProjects(): Promise<Project[]> {
  const memories = await db.pages.where('status').equals('embedded').toArray();
  const withVec = memories.filter((m) => m.embedding && m.embedding.length);
  if (withVec.length < 3) return [];

  // Sort by recency so newer context anchors clusters.
  withVec.sort((a, b) => b.lastVisitedAt - a.lastVisitedAt);

  const clusters: Cluster[] = [];
  for (const m of withVec) {
    let bestIdx = -1;
    let bestSim = SIM_THRESHOLD;
    for (let i = 0; i < clusters.length; i++) {
      const sim = cosineSimilarity(m.embedding!, clusters[i].centroid);
      const sharesDomain = clusters[i].domains.has(m.domain);
      const effective = sharesDomain ? sim + 0.08 : sim;
      if (effective > bestSim) {
        bestSim = effective;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      clusters.push({
        centroid: m.embedding!.slice(),
        members: [m],
        domains: new Set([m.domain]),
      });
    } else {
      const c = clusters[bestIdx];
      c.members.push(m);
      c.domains.add(m.domain);
      c.centroid = centroid(c.members.map((x) => x.embedding!));
    }
  }

  const meaningful = clusters.filter((c) => c.members.length >= 2);

  // Persist: wipe old projects, write fresh ones, tag memories.
  const now = Date.now();
  await db.transaction('rw', db.projects, db.pages, async () => {
    await db.projects.clear();
    for (const c of meaningful) {
      const project: Project = {
        name: nameCluster(c),
        centroid: c.centroid,
        domains: [...c.domains],
        memoryIds: c.members.map((m) => m.id!).filter(Boolean),
        createdAt: now,
        updatedAt: now,
      };
      const id = await db.projects.add(project);
      project.id = id;
      for (const m of c.members) {
        if (m.id != null) await db.pages.update(m.id, { projectId: id });
      }
    }
  });

  return db.projects.toArray();
}
