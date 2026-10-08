// KEY_MODE, read in one place. Shared by lib/config.ts and src/proxy.ts (which can't import
// config.ts: that file is marked server-only, and the proxy bundle isn't a React Server environment).
//
// Anything other than exactly "server" means "user", so a typo or an unset variable fails
// safe: visitors must bring their own keys and the environment keys are ignored.

export type KeyMode = "user" | "server";

export function keyMode(): KeyMode {
  return process.env.KEY_MODE?.trim() === "server" ? "server" : "user";
}
