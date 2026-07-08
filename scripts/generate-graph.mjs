// Generates a synthetic-but-plausible legal knowledge graph and bakes 3D
// positions with d3-force-3d so the hero flythrough is instant & deterministic.
// Swap in a real Neo4j export later: same { nodes, links } schema. If nodes
// lack x/y/z, the runtime will lay them out itself.
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
} from 'd3-force-3d';
import { writeFileSync, mkdirSync } from 'node:fs';

// --- deterministic PRNG so regenerations are stable ---
let seed = 20260707;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const range = (n) => Array.from({ length: n }, (_, i) => i);

// --- plausible legal vocabulary, grouped into topical clusters ---
const CLUSTERS = [
  { key: 'asylum', statutes: ['INA §208', '8 U.S.C. §1158', '8 C.F.R. §1208.13'], stem: 'Asylum' },
  { key: 'withholding', statutes: ['INA §241(b)(3)', '8 U.S.C. §1231'], stem: 'Withholding' },
  { key: 'cat', statutes: ['8 C.F.R. §1208.16', 'CAT Art. 3'], stem: 'CAT Protection' },
  { key: 'cancellation', statutes: ['INA §240A', '8 U.S.C. §1229b'], stem: 'Cancellation' },
  { key: 'removability', statutes: ['INA §237', 'INA §212(a)', '8 U.S.C. §1227'], stem: 'Removability' },
  { key: 'crimmigration', statutes: ['INA §101(a)(43)', '8 U.S.C. §1101'], stem: 'Aggravated Felony' },
  { key: 'due_process', statutes: ['U.S. Const. amend. V', '8 U.S.C. §1229a'], stem: 'Due Process' },
  { key: 'credibility', statutes: ['INA §208(b)(1)(B)', 'REAL ID Act §101'], stem: 'Credibility' },
];

const PRECEDENTS = [
  'Matter of A-B-', 'Matter of L-E-A-', 'Matter of M-E-V-G-', 'Matter of Acosta',
  'Matter of Kasinga', 'INS v. Cardoza-Fonseca', 'INS v. Elias-Zacarias',
  'Matter of Mogharrabi', 'Matter of S-E-G-', 'Matter of W-G-R-', 'Matter of Y-L-',
  'Nasrallah v. Barr', 'Pereira v. Sessions', 'Niz-Chavez v. Garland',
  'Matter of Z-Z-O-', 'Matter of R-A-', 'Matter of J-R-G-P-',
];
const CIRCUITS = ['9th Cir.', '5th Cir.', '2d Cir.', '1st Cir.', 'BIA', '4th Cir.', '11th Cir.', '3d Cir.'];
const YEARS = range(24).map((i) => 2000 + i);

const nodes = [];
const links = [];
const byCluster = {};

// statute nodes (landmark, large)
for (const c of CLUSTERS) {
  byCluster[c.key] = { statutes: [], precedents: [], opinions: [] };
  for (const s of c.statutes) {
    const id = `st-${nodes.length}`;
    nodes.push({ id, type: 'statute', label: s, cluster: c.key, val: 6 });
    byCluster[c.key].statutes.push(id);
  }
}

// precedent nodes (medium) — each anchored to a cluster
for (let i = 0; i < PRECEDENTS.length; i++) {
  const c = CLUSTERS[i % CLUSTERS.length];
  const id = `pr-${nodes.length}`;
  nodes.push({ id, type: 'precedent', label: PRECEDENTS[i], cluster: c.key, val: 4 });
  byCluster[c.key].precedents.push(id);
  // precedents cite the statutes in their cluster
  for (const st of byCluster[c.key].statutes) links.push({ source: id, target: st, type: 'construes' });
}

// opinion nodes (many, small) — the bulk of the graph
const OPINION_COUNT = 360;
for (let i = 0; i < OPINION_COUNT; i++) {
  const c = pick(CLUSTERS);
  const id = `op-${nodes.length}`;
  const label = `${c.stem} — ${pick(CIRCUITS)} ${pick(YEARS)}`;
  nodes.push({ id, type: 'opinion', label, cluster: c.key, val: 1.6 });
  byCluster[c.key].opinions.push(id);

  // each opinion cites 1–2 precedents (mostly same cluster) + sometimes a statute
  const prPool = byCluster[c.key].precedents.length ? byCluster[c.key].precedents : PRECEDENTS.map((_, k) => `pr-${k}`);
  const nCites = 1 + Math.floor(rand() * 2);
  for (let k = 0; k < nCites; k++) links.push({ source: id, target: pick(prPool), type: 'cites' });
  if (rand() < 0.4 && byCluster[c.key].statutes.length) {
    links.push({ source: id, target: pick(byCluster[c.key].statutes), type: 'applies' });
  }
  // occasional cross-cluster citation → enables multi-hop paths
  if (rand() < 0.12) {
    const other = pick(CLUSTERS);
    if (byCluster[other.key].precedents.length) {
      links.push({ source: id, target: pick(byCluster[other.key].precedents), type: 'distinguishes' });
    }
  }
}

// cross-cluster precedent links (the connective tissue for flythrough drama)
for (let i = 0; i < 14; i++) {
  const a = pick(nodes.filter((n) => n.type === 'precedent'));
  const b = pick(nodes.filter((n) => n.type === 'precedent'));
  if (a.id !== b.id) links.push({ source: a.id, target: b.id, type: 'relates' });
}

// --- bake 3D layout with d3-force-3d ---
const sim = forceSimulation(nodes, 3)
  .force('charge', forceManyBody().strength(-24))
  .force('link', forceLink(links).id((d) => d.id).distance(18).strength(0.35))
  .force('center', forceCenter(0, 0, 0))
  .force('collide', forceCollide(2.2))
  .stop();

for (let i = 0; i < 320; i++) sim.tick();

// round positions, strip sim-internal fields
const outNodes = nodes.map((n) => ({
  id: n.id,
  type: n.type,
  label: n.label,
  cluster: n.cluster,
  val: n.val,
  x: +n.x.toFixed(2),
  y: +n.y.toFixed(2),
  z: +n.z.toFixed(2),
}));
const outLinks = links.map((l) => ({
  source: typeof l.source === 'object' ? l.source.id : l.source,
  target: typeof l.target === 'object' ? l.target.id : l.target,
  type: l.type,
}));

// pick a plausible multi-hop path for the Legal RAG section to light up:
// opinion -> precedent -> statute, plus a cross to another precedent
function findFeaturedPath() {
  const op = outNodes.find((n) => n.type === 'opinion');
  const cite = outLinks.find((l) => l.source === op.id && l.target.startsWith('pr-'));
  const pr = cite?.target;
  const construes = outLinks.find((l) => l.source === pr && l.target.startsWith('st-'));
  const st = construes?.target;
  return [op?.id, pr, st].filter(Boolean);
}

const graph = {
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    note: 'Synthetic immigration-law graph. Replace with a real Neo4j export using the same { nodes, links } schema; drop x/y/z to have the runtime lay it out.',
    nodeCount: outNodes.length,
    linkCount: outLinks.length,
    featuredPath: findFeaturedPath(),
  },
  nodes: outNodes,
  links: outLinks,
};

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/graph.json', JSON.stringify(graph));
console.log(`graph.json: ${outNodes.length} nodes, ${outLinks.length} links, path=${graph.meta.featuredPath.join(' → ')}`);
