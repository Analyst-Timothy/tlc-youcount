const base = String(process.env.LOAD_TEST_URL || "http://127.0.0.1:8765").replace(/\/$/, "");
const users = Math.max(1, Math.min(2000, Number(process.env.LOAD_TEST_USERS || 500)));
const locations = ["Liberty Point Woodford", "North London", "Canary Wharf", "Croydon", "Birmingham", "Lagos", "Houston", "e-TLC", "YouTube"];
const paths = ["/", "/app.js", "/styles.css", "/api/service-status"];
const samples = [];

async function virtualUser(index) {
  const location = locations[index % locations.length];
  for (const path of paths) {
    const started = performance.now();
    try {
      const response = await fetch(`${base}${path}`, { headers: { "x-load-test-location": location } });
      await response.arrayBuffer();
      samples.push({ ok: response.ok, status: response.status, ms: performance.now() - started, path, location });
    } catch (error) {
      samples.push({ ok: false, status: 0, ms: performance.now() - started, path, location, error: error.message });
    }
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: users }, (_, index) => virtualUser(index)));
const sorted = samples.map((item) => item.ms).sort((a, b) => a - b);
const percentile = (value) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] || 0;
const failures = samples.filter((item) => !item.ok);
const statusCounts = Object.fromEntries([...new Set(samples.map((item) => item.status))].map((status) => [status, samples.filter((item) => item.status === status).length]));
console.log(JSON.stringify({
  base, users, locations: locations.length, requests: samples.length,
  durationMs: Math.round(performance.now() - started),
  successRate: Number((((samples.length - failures.length) / samples.length) * 100).toFixed(2)),
  latencyMs: { median: Math.round(percentile(.5)), p95: Math.round(percentile(.95)), p99: Math.round(percentile(.99)), max: Math.round(sorted.at(-1) || 0) },
  statusCounts,
  failures: failures.slice(0, 10),
}, null, 2));
if (failures.length) process.exitCode = 1;
