import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
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

  function read(): T {
    if (!existsSync(filename)) {
      const initial = create();
      if (seed) writePrivateJsonFile(filename, initial);
      return initial;
    }
    try {
      return schema.parse(JSON.parse(readFileSync(filename, "utf8")));
    } catch (error) {
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
    return next;
  }

  return { read, update };
}
