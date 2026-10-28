import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Db, LedgerEvent } from "./types.ts";

/**
 * Tiny JSON-file data store. Dependency-free, good enough for the scaffold
 * and the hosted demo. Swap for a real database before any production use.
 */
export class JsonStore {
  private readonly file: string;
  private db: Db;

  constructor(file = process.env.DATA_FILE ?? "./data/db.json") {
    this.file = resolve(file);
    if (existsSync(this.file)) {
      this.db = JSON.parse(readFileSync(this.file, "utf8")) as Db;
    } else {
      this.db = { contracts: [], events: [] };
      this.persist();
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.db, null, 2));
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
