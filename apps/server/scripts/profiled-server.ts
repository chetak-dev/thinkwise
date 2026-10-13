// Runs the game server and exits cleanly when stdin closes, so `--cpu-prof` can save its profile (Windows has no SIGINT for child processes).
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
await import('../src/index.js');
