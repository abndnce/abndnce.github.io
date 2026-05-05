import { writeFile } from 'node:fs/promises';
const GATEWAYS_URL =
  'https://raw.githubusercontent.com/ipfs/public-gateway-checker/2d34e27d80c85b8ff6cf06693c0fab5cfd495080/gateways.json';
const IPNS_PATH = '/ipns/k51qzi5uqu5dgn54ka0d91se4ytmy9uiend9pk4zfuwroenqhwllm05hzwuac6/';
const MIN_SIZE = 100 * 1024;
const TIMEOUT = 15000;
const CONCURRENCY = 10;
const OUTPUT = 'data/ipfs.json';
async function checkGateway(gateway: string) {
  const base = gateway.replace(/\/+$/, '');
  const url = base + IPNS_PATH;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    if (!gateway.includes('dweb.link') && response.url.includes('dweb.link')) {
      return { gateway, working: false as const, reason: 'redirected to dweb.link' };
    }
    if (response.status !== 200) {
      const body = await response.text();
      const preview = body.slice(0, 40);
      if (!preview) {
        return { gateway, working: false as const, reason: `HTTP ${response.status} (no body)` };
      }
      const isHtml =
        preview.toLowerCase().startsWith('<!') || preview.toLowerCase().startsWith('<ht');
      return {
        gateway,
        working: false as const,
        reason: `HTTP ${response.status}${isHtml ? ' (html body)' : ` "${preview}"`}`,
      };
    }

    const cl = response.headers.get('content-length');
    let sizeOk = cl ? parseInt(cl, 10) >= MIN_SIZE : false;
    let bodyStart = '';
    let actualSize = 0;
    if (!sizeOk) {
      const reader = response.body!.getReader();
      let total = 0;
      let done = false;
      while (!done && total < MIN_SIZE + 1) {
        const chunk = await reader.read();
        done = chunk.done;
        const bytes = chunk.value?.length || 0;
        if (total === 0 && bytes > 0) {
          bodyStart = new TextDecoder().decode(chunk.value!.slice(0, 40));
        }
        total += bytes;
      }
      reader.cancel();
      actualSize = total;
      sizeOk = total >= MIN_SIZE;
    }
    if (!sizeOk) {
      const isHtml =
        bodyStart.toLowerCase().startsWith('<!') || bodyStart.toLowerCase().startsWith('<ht');
      const size = cl
        ? `${Math.round(parseInt(cl) / 1024)}KB`
        : `${Math.round(actualSize / 1024)}KB`;
      return {
        gateway,
        working: false as const,
        reason: `small content (${size}${isHtml ? ', html' : `, "${bodyStart}"`})`,
      };
    }

    return { gateway, working: true as const, reason: 'ok' };
  } catch (err) {
    return {
      gateway,
      working: false as const,
      reason:
        err instanceof Error && err.name === 'AbortError'
          ? 'timeout'
          : err instanceof Error
            ? err.cause
              ? `${err.message} (${err.cause})`
              : err.message
            : String(err),
    };
  }
}

const resp = await fetch(GATEWAYS_URL);
const gateways = (await resp.json()) as string[];

console.log(`checking ${gateways.length} gateways...`);

const results: { gateway: string; working: boolean; reason: string }[] = [];
let done = 0;

for (let i = 0; i < gateways.length; i += CONCURRENCY) {
  const batch = gateways.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map(async (gw) => {
      const r = await checkGateway(gw);
      done++;
      const icon = r.working ? '✓' : '✗';
      console.log(`${icon}
[${done}/${gateways.length}] ${r.gateway} — ${r.reason}`);
      results.push(r);
    }),
  );
}
const working = results.filter((r) => r.working).map((r) => r.gateway);
await writeFile(OUTPUT, JSON.stringify(working, null, 2) + '\n');
console.log(`\ndone — ${working.length}/${results.length}
working, written to ${OUTPUT}`);
