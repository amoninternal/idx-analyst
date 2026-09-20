import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isAbortError } from "./abort";
import { config } from "./config";

// Two-level cache (memory, then JSON files under .data/cache) for anything that
// costs API credits. The disk level survives restarts, so reloading a page
// during development doesn't spend credits again.

type Entry = { key: string; storedAt: number; data: unknown };

const MAX_MEMORY_ENTRIES = 800;
const cacheDir = path.join(config.dataDir, "cache");

// Kept on globalThis so hot reloads in development share one cache.
const state = ((globalThis as { __idxCache?: { memory: Map<string, Entry>; inflight: Map<string, Promise<unknown>> } }).__idxCache ??= {
  memory: new Map(),
  inflight: new Map(),
});

const fileFor = (key: string) => path.join(cacheDir, `${crypto.createHash("sha1").update(key).digest("hex")}.json`);

function remember(entry: Entry) {
  state.memory.delete(entry.key);
  state.memory.set(entry.key, entry);
  if (state.memory.size > MAX_MEMORY_ENTRIES) {
    const oldest = state.memory.keys().next().value;
    if (oldest !== undefined) state.memory.delete(oldest);
  }
}

export async function peek<T>(key: string): Promise<{ data: T; storedAt: number } | null> {
  const inMemory = state.memory.get(key);
  if (inMemory) return { data: inMemory.data as T, storedAt: inMemory.storedAt };
  try {
    const entry = JSON.parse(await fs.readFile(fileFor(key), "utf8")) as Entry;
    if (entry.key !== key) return null;
    remember(entry);
    return { data: entry.data as T, storedAt: entry.storedAt };
  } catch {
    return null;
  }
}

export async function put(key: string, data: unknown): Promise<void> {
  const entry: Entry = { key, storedAt: Date.now(), data };
  remember(entry);
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const file = fileFor(key);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(entry));
    await fs.rename(tmp, file);
  } catch (err) {
    console.warn("[cache] could not write", key, err);
  }
}

/**
 * Returns the cached value for `key` if it is younger than `ttlMs`, otherwise
 * runs `load`. Concurrent callers share one in-flight load. If `load` fails and
 * an older copy exists, the older copy is returned unless `staleOnError` says no.
 */
export function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  opts: { staleOnError?: (err: unknown) => boolean } = {},
): Promise<T> {
  // Claim the key before the first await, so concurrent callers (a page and its
  // metadata, or parallel tool calls) share one lookup and one paid request.
  const pending = state.inflight.get(key);
  if (pending) {
    // If the caller that started this load stopped (a cancelled chat), load again for this one.
    return (pending as Promise<T>).catch((err) => (isAbortError(err) ? cached(key, ttlMs, load, opts) : Promise.reject(err)));
  }

  const job: Promise<T> = (async () => {
    const hit = await peek<T>(key);
    if (hit && Date.now() - hit.storedAt < ttlMs) return hit.data;
    try {
      const data = await load();
      await put(key, data);
      return data;
    } catch (err) {
      if (hit && (opts.staleOnError?.(err) ?? true)) {
        console.warn(`[cache] serving stale copy of ${key}: ${(err as Error).message}`);
        return hit.data;
      }
      throw err;
    }
  })();
  state.inflight.set(key, job);
  // Only this job's own entry is removed; a newer load for the key keeps its slot.
  const release = () => {
    if (state.inflight.get(key) === job) state.inflight.delete(key);
  };
  job.then(release, release);
  return job;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
