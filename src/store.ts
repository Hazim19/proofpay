import {
  chmodSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { Db, LedgerEvent } from "./types.ts";

/**
 * Tiny JSON-file data store. Dependency-free, good enough for the scaffold
 * and the hosted demo. Swap for a real database before any production use.
 *
 * Durability (audit T-8): every persist is atomic — write to a temp file,
 * fsync, then rename over the live file — so a crash or kill mid-write can
 * never leave a torn db.json behind. The previous good contents are kept in
 * `<file>.bak`; if the main file still fails to parse at startup (e.g. it
 * was damaged by an older non-atomic build), the backup is loaded instead.
 * The file is owner-only (0600): it holds emails, deliverables and PayPal
 * ids (audit R-2).
 */
export class JsonStore {
  private readonly file: string;
  private db: Db;

  constructor(file = process.env.DATA_FILE ?? "./data/db.json") {
    this.file = resolve(file);
    this.db = this.load();
  }

  private load(): Db {
    if (!existsSync(this.file)) {
      const empty: Db = { contracts: [], events: [] };
      this.db = empty;
      this.persist();
      return empty;
    }
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as Db;
    } catch (mainErr) {
      const bak = `${this.file}.bak`;
      if (existsSync(bak)) {
        try {
          const recovered = JSON.parse(readFileSync(bak, "utf8")) as Db;
          console.error(
            `JsonStore: ${this.file} is unreadable (${mainErr instanceof Error ? mainErr.message : mainErr}); recovered last good state from ${bak}`,
          );
          return recovered;
        } catch {
          /* fall through to the throw below */
        }
      }
      throw new Error(
        `JsonStore: cannot parse ${this.file} and no readable backup exists: ${
          mainErr instanceof Error ? mainErr.message : String(mainErr)
        }`,
      );
    }
  }

  private persist(): void {
    const dir = dirname(this.file);
    mkdirSync(dir, { recursive: true });
    const contents = JSON.stringify(this.db, null, 2);
    // Preserve the last good state before replacing it.
    if (existsSync(this.file)) {
      try {
        copyFileSync(this.file, `${this.file}.bak`);
      } catch {
        /* a failed backup must never block the write itself */
      }
    }
    const tmp = `${this.file}.tmp-${process.pid}`;
    writeFileSync(tmp, contents, { mode: 0o600 });
    const fd = openSync(tmp, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.file);
    chmodSync(this.file, 0o600);
  }

  get data(): Db {
    return this.db;
  }

  save(): void {
    this.persist();
  }

  addEvent(event: LedgerEvent): LedgerEvent {
    this.db.events.push(event);
    this.persist();
    return event;
  }
}
