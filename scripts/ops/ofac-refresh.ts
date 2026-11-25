// Downloads OFAC's SDN list afresh into .cache/ofac, the snapshot the CLI, the benchmark and the web app screen against.
import { resolve } from 'node:path';
import '@triad/intel/dns';
import { loadSdnListCached } from '@triad/intel';

const list = await loadSdnListCached(resolve(import.meta.dirname, '../../.cache/ofac'), 0);
console.log(JSON.stringify(list.snapshot, null, 1));
