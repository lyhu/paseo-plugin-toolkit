import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { z } from "zod";

export interface RevisionedJsonStore<T extends { revision: number }> {
  read(): T;
  update(expectedRevision: number, mutate: (current: T) => T): T;
}

/** Write a JSON document with owner-only permissions and an atomic rename. */
export function writePrivateJsonFile(filename: string, value: unknown): void {
  mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    renameSync(temporary, filename);
    chmodSync(filename, 0o600);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

/**
 * Owns the persistence protocol shared by host documents: atomic replacement, owner-only
 * permissions, schema validation, and revision-based optimistic concurrency.
 */
export function createRevisionedJsonStore<T extends { revision: number }>(options: {
  filename: string;
  schema: z.ZodType<T>;
  create: () => T;
  concurrencyError: string;
  readError?: string;
  /** Persist the default document on first read. */
  seed?: boolean;
}): RevisionedJsonStore<T> {
  const { filename, schema, create, concurrencyError, readError, seed = false } = options;
  let cached: { mtimeMs: number; size: number; value: T } | null = null;

  function read(): T {
    if (!existsSync(filename)) {
      cached = null;
      const initial = create();
      if (seed) {
        writePrivateJsonFile(filename, initial);
        try {
          const stat = statSync(filename);
          cached = { mtimeMs: stat.mtimeMs, size: stat.size, value: initial };
        } catch {
          // ignore stat failure
        }
      }
      return initial;
    }
    try {
      const stat = statSync(filename);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached.value;
      }
      const parsed = schema.parse(JSON.parse(readFileSync(filename, "utf8")));
      cached = { mtimeMs: stat.mtimeMs, size: stat.size, value: parsed };
      return parsed;
    } catch (error) {
      cached = null;
      if (readError) throw new Error(readError);
      throw error;
    }
  }

  function update(expectedRevision: number, mutate: (current: T) => T): T {
    const current = read();
    if (current.revision !== expectedRevision) throw new Error(concurrencyError);
    const next = schema.parse(mutate(current));
    next.revision = current.revision + 1;
    writePrivateJsonFile(filename, next);
    try {
      const stat = statSync(filename);
      cached = { mtimeMs: stat.mtimeMs, size: stat.size, value: next };
    } catch {
      cached = null;
    }
    return next;
  }

  return { read, update };
}
