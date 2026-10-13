/**
 * Load test: one 30-question game with N simulated players against a local game server.
 * Run: node --import tsx scripts/load.ts 500
 * Reports server CPU time and memory (Windows: via Get-Process) and the size of the end-of-game results.
 */
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { AVATARS, type ServerMessage } from '@thinkwise/shared';

const PLAYERS = Number(process.argv[2] ?? 300);
const QUESTIONS = Number(process.argv[3] ?? 30);
const PORT = 4700;
const RESULTS_PORT = 4701;
const SECRET = 'dev-only-realtime-secret';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function serverStats(pid: number) {
  const out = execSync(
    `powershell -NoProfile -Command "$p = Get-Process -Id ${pid}; '{0} {1} {2}' -f $p.TotalProcessorTime.TotalSeconds, $p.WorkingSet64, $p.PeakWorkingSet64"`,
  )
    .toString()
    .trim()
    .split(' ')
    .map(Number);
  return { cpuS: out[0]!, memMb: out[1]! / 1048576, peakMb: out[2]! / 1048576 };
}

let resultsBytes = 0;
const receiver = createServer((req, res) => {
  let size = 0;
  req.on('data', (c: Buffer) => (size += c.length));
  req.on('end', () => {
    resultsBytes = size;
    res.writeHead(204).end();
  });
});
await new Promise<void>((r) => receiver.listen(RESULTS_PORT, '127.0.0.1', r));

const PROFILE = Boolean(process.env.PROFILE);
const server = spawn(
  process.execPath,
  PROFILE ? ['--cpu-prof', '--cpu-prof-dir=.profiles', '--import', 'tsx', 'scripts/profiled-server.ts'] : ['--import', 'tsx', 'src/index.ts'],
  {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', RESULTS_URL: `http://127.0.0.1:${RESULTS_PORT}/r` },
    stdio: ['pipe', 'pipe', 'inherit'],
  },
);
await new Promise<void>((resolve) => server.stdout!.on('data', (d: Buffer) => d.toString().includes('listening') && resolve()));
await sleep(500);
const idle = serverStats(server.pid!);

const quiz = {
  title: 'Load',
  rules: { showLeaderboard: true },
  questions: Array.from({ length: QUESTIONS }, (_, i) => ({
    type: 'mc',
    text: `Question ${i + 1}: which option is right?`,
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correct: [i % 4],
    timeLimitMs: 20_000,
    points: 1000,
  })),
};
const created = (await (
  await fetch(`http://127.0.0.1:${PORT}/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ quiz }),
  })
).json()) as { gameId: string; pin: string; hostToken: string };

const received = { host: 0, players: 0 };
function connect(onMessage: (m: ServerMessage, ws: WebSocket) => void, who: 'host' | 'players' = 'players') {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  ws.on('message', (raw: Buffer) => {
    received[who] += raw.length;
    onMessage(JSON.parse(raw.toString()) as ServerMessage, ws);
  });
  return new Promise<WebSocket>((r) => ws.once('open', () => r(ws)));
}

let reveals = 0;
let finished = false;
const host = await connect((m, ws) => {
  // Real hosts show the leaderboard between questions, so the test does too.
  if (m.t === 'reveal') {
    reveals += 1;
    setTimeout(() => ws.send(JSON.stringify({ t: 'host:leaderboard' })), 100);
  }
  if (m.t === 'leaderboard') setTimeout(() => ws.send(JSON.stringify({ t: 'host:next' })), 100);
  if (m.t === 'final') finished = true;
}, 'host');
host.send(JSON.stringify({ t: 'host:resume', gameId: created.gameId, hostToken: created.hostToken }));
await sleep(300);

let joined = 0;
const ackMs: number[] = [];
const sockets: WebSocket[] = [];
for (let i = 0; i < PLAYERS; i++) {
  let sentAt = 0;
  const ws = await connect((m, sock) => {
    if (m.t === 'player:ready') joined += 1;
    if (m.t === 'answer:ok') ackMs.push(Date.now() - sentAt);
    // Answer like a person would: somewhere in the first few seconds.
    if (m.t === 'question') {
      const index = m.question.index;
      setTimeout(() => {
        sentAt = Date.now();
        sock.send(JSON.stringify({ t: 'player:answer', index, choice: Math.floor(Math.random() * 4) }));
      }, 300 + Math.random() * 3000);
    }
  });
  ws.send(JSON.stringify({ t: 'player:join', pin: created.pin, nickname: `Player ${i + 1}`, avatar: AVATARS[i % AVATARS.length] }));
  sockets.push(ws);
  if (i % 50 === 49) await sleep(50);
}
while (joined < PLAYERS) await sleep(100);
const lobby = serverStats(server.pid!);

const started = Date.now();
host.send(JSON.stringify({ t: 'host:start' }));
while (!finished) await sleep(100);
const playMs = Date.now() - started;
await sleep(1500);
const end = serverStats(server.pid!);

const gameCpu = end.cpuS - lobby.cpuS;
ackMs.sort((a, b) => a - b);
const pct = (p: number) => ackMs[Math.min(ackMs.length - 1, Math.floor(ackMs.length * p))] ?? 0;
console.log(
  JSON.stringify(
    {
      players: PLAYERS,
      questions: QUESTIONS,
      reveals,
      wallSeconds: +(playMs / 1000).toFixed(1),
      joinCpuSeconds: +(lobby.cpuS - idle.cpuS).toFixed(2),
      gameCpuSeconds: +gameCpu.toFixed(2),
      cpuPerQuestionMs: Math.round((gameCpu / QUESTIONS) * 1000),
      answerAckMs: { p50: pct(0.5), p95: pct(0.95), max: ackMs.at(-1) ?? 0 },
      memoryMb: { idle: Math.round(idle.memMb), withPlayers: Math.round(lobby.memMb), peak: Math.round(end.peakMb) },
      sentMb: { toHost: +(received.host / 1048576).toFixed(1), toPlayers: +(received.players / 1048576).toFixed(1) },
      resultsKb: Math.round(resultsBytes / 1024),
    },
    null,
    2,
  ),
);

for (const s of [host, ...sockets]) s.terminate();
server.stdin!.end();
await sleep(PROFILE ? 3000 : 200);
server.kill();
receiver.close();
process.exit(0);
