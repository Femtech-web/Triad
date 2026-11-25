import 'server-only';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { get, list, put } from '@vercel/blob';
import { onVercel } from './where';

// Where shared evidence and the public ledger live: the deployment's Vercel Blob store when it has one, a folder under
// the repository's .cache when run locally, and nowhere otherwise (the app then runs without permalinks or a ledger).
// Everything written here is meant to be public: redacted ledger entries, and evidence its owner chose to share.

export interface Store {
  put(path: string, body: string): Promise<void>;
  read(path: string): Promise<string | null>;
  // Pathnames under a prefix, in name order.
  list(prefix: string, limit: number): Promise<string[]>;
}

const blobStore: Store = {
  async put(path, body) {
    await put(path, body, { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
  },
  async read(path) {
    try {
      const found = await get(path, { access: 'public' });
      return found?.statusCode === 200 ? await new Response(found.stream).text() : null;
    } catch { return null; }
  },
  async list(prefix, limit) {
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, limit: Math.min(1000, limit - names.length), ...(cursor ? { cursor } : {}) });
      names.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor && names.length < limit);
    return names.sort();
  },
};

const ROOT = join(process.cwd(), '../../.cache/store');
const folderStore: Store = {
  async put(path, body) {
    await mkdir(dirname(join(ROOT, path)), { recursive: true });
    await writeFile(join(ROOT, path), body);
  },
  async read(path) {
    try { return await readFile(join(ROOT, path), 'utf8'); } catch { return null; }
  },
  async list(prefix, limit) {
    const dir = prefix.slice(0, prefix.lastIndexOf('/') + 1);
    try { return (await readdir(join(ROOT, dir))).map((f) => `${dir}${f}`).filter((p) => p.startsWith(prefix)).sort().slice(0, limit); } catch { return []; }
  },
};

// The Blob store only on Vercel itself (or when asked for), so local runs with a pulled token never write to the
// production ledger.
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN) && (onVercel || process.env.TRIAD_STORE === 'blob');
export const store: Store | null = useBlob ? blobStore : onVercel ? null : folderStore;
