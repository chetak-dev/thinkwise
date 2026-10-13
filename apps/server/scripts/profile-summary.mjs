// Summarises a .cpuprofile: self time per function, top N. Usage: node scripts/profile-summary.mjs <file> [N]
import { readFileSync } from 'node:fs';

const [file, top = '25'] = process.argv.slice(2);
const profile = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const deltas = profile.timeDeltas;
profile.samples.forEach((id, i) => {
  const n = byId.get(id);
  const f = n.callFrame;
  const key = `${f.functionName || '(anonymous)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + (deltas[i] ?? 0));
});
const total = [...self.values()].reduce((a, b) => a + b, 0);
const idle = [...self.entries()].filter(([k]) => k.startsWith('(idle)')).reduce((a, [, v]) => a + v, 0);
console.log(`busy ${((total - idle) / 1000).toFixed(0)} ms of ${(total / 1000).toFixed(0)} ms`);
for (const [k, v] of [...self.entries()].filter(([k]) => !k.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, Number(top))) {
  console.log(`${((v / (total - idle)) * 100).toFixed(1).padStart(5)}%  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
}
