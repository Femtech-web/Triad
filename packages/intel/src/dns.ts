import { lookup } from 'node:dns';
import { isIP } from 'node:net';
import { Agent, setGlobalDispatcher } from 'undici';

// Opt-in (TELEGRAPH_DNS=google) for networks whose resolver returns unreachable addresses for Telegraph's node, as
// observed on 24 Nov 2026. Only the node's name is resolved through Google's public DNS; TLS and the host are unchanged.
const PERMITTED = new Set(['devnode.telegraphprotocol.com']);

if (process.env.TELEGRAPH_DNS === 'google') {
  setGlobalDispatcher(new Agent({ autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 250, connect: {
    lookup(hostname, options, callback) {
      if (!PERMITTED.has(hostname)) return lookup(hostname, options, callback);
      void (async () => {
        const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
        if (!response.ok) throw new Error('Public DNS lookup failed.');
        const data = await response.json() as { Status?: number; Answer?: { type: number; data: string }[] };
        const addresses = data.Status === 0 ? (data.Answer ?? []).filter((a) => a.type === 1 && isIP(a.data) === 4).map((a) => ({ address: a.data, family: 4 })) : [];
        if (!addresses.length) throw new Error('Public DNS returned no IPv4 answer.');
        if (options.all) callback(null, addresses);
        else callback(null, addresses[0]!.address, 4);
      })().catch((error: Error) => callback(error, '', 4));
    },
  } }));
}
