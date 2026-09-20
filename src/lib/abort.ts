import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// Carries an analyst request's AbortSignal into the data layer without
// threading it through every function. Checked before each new Sectors
// request, so a stopped chat starts no more paid calls. Requests already sent
// finish normally: Sectors bills them either way, and other callers may share
// them through the cache.

const store = new AsyncLocalStorage<AbortSignal>();

export function runWithSignal<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
  return signal ? store.run(signal, fn) : fn();
}

/** Throws an AbortError if the current analyst request has been stopped. */
export function throwIfStopped() {
  store.getStore()?.throwIfAborted();
}

export function isAbortError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "AbortError";
}
