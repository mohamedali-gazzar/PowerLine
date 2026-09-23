// Tests for the on-device backup.
//
// This module is what stands between an estimator and a repeat of 23 September 2026, when
// six hours of work was lost to a dropped connection. Every branch here is a way that could
// happen again: a backup that silently fails to store, one that is offered to the wrong
// person, or one that is thrown away while it still held the only copy of the work.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { writeBackup, readBackup, clearBackup, unsavedWork } from "./offlineBackup";

/** Minimal localStorage. `limit` lets a test fill the store the way a real quota does. */
function installStorage(limit = Infinity) {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const after = [...map.entries()].reduce((n, [a, b]) => n + (a === k ? 0 : a.length + b.length), 0);
      if (after + k.length + v.length > limit) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k: string) => { map.delete(k); },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
  vi.stubGlobal("localStorage", store);
  return map;
}

beforeEach(() => { installStorage(); });

describe("the on-device backup", () => {
  it("keeps the work and gives it back", () => {
    expect(writeBackup("q1", '{"a":1}', "user-1")).toBe(true);
    const b = readBackup("q1");
    expect(b?.state).toBe('{"a":1}');
    expect(b?.userId).toBe("user-1");
    expect(b?.savedAt).toBeGreaterThan(0);
  });

  it("returns null rather than throwing when there is nothing, or when it is corrupt", () => {
    expect(readBackup("missing")).toBeNull();
    localStorage.setItem("pl-qtn-backup:broken", "{not json");
    expect(readBackup("broken")).toBeNull();
  });

  it("NEVER throws when the device refuses to store anything", () => {
    // A private window, or storage blocked entirely. The editor must keep working; the
    // caller is told false so it can warn that there is no safety net.
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
      key: () => { throw new Error("blocked"); },
      get length(): number { throw new Error("blocked"); },
    });
    expect(writeBackup("q1", '{"a":1}', "u")).toBe(false);
    expect(readBackup("q1")).toBeNull();
    expect(() => clearBackup("q1")).not.toThrow();
    expect(unsavedWork("q1", "{}", "u")).toBeNull();
  });

  it("sacrifices OTHER quotations' backups to fit the one being worked on", () => {
    // The open quotation is the one holding unsaved work. A full store must not mean the
    // live one goes unprotected.
    const map = installStorage(220);
    expect(writeBackup("old", "x".repeat(60), "u")).toBe(true);
    expect(writeBackup("current", "y".repeat(140), "u")).toBe(true);
    expect(readBackup("current")?.state).toBe("y".repeat(140));
    expect(readBackup("old")).toBeNull();
    expect([...map.keys()]).toEqual(["pl-qtn-backup:current"]);
  });

  describe("deciding whether there is unsaved work", () => {
    it("says nothing is pending when the server already has it, and tidies up", () => {
      writeBackup("q1", '{"a":1}', "u");
      expect(unsavedWork("q1", '{"a":1}', "u")).toBeNull();
      // …and the now-pointless copy is gone rather than left to be offered later.
      expect(readBackup("q1")).toBeNull();
    });

    it("offers the work back when the server's copy differs", () => {
      writeBackup("q1", '{"a":2}', "u");
      expect(unsavedWork("q1", '{"a":1}', "u")?.state).toBe('{"a":2}');
    });

    it("does not offer one person's work to another on a shared computer", () => {
      writeBackup("q1", '{"a":2}', "esraa");
      expect(unsavedWork("q1", '{"a":1}', "mohamed")).toBeNull();
      // …and it is NOT deleted — it is still esraa's to recover when she signs back in.
      expect(readBackup("q1")?.state).toBe('{"a":2}');
    });

    it("still offers a backup written before users were recorded", () => {
      // Written by an older build that stored no userId; refusing it would lose real work.
      localStorage.setItem(
        "pl-qtn-backup:q1",
        JSON.stringify({ savedAt: Date.now(), state: '{"a":2}' }),
      );
      expect(unsavedWork("q1", '{"a":1}', "anyone")?.state).toBe('{"a":2}');
    });
  });

  it("clears only the quotation asked for", () => {
    writeBackup("q1", "a", "u");
    writeBackup("q2", "b", "u");
    clearBackup("q1");
    expect(readBackup("q1")).toBeNull();
    expect(readBackup("q2")?.state).toBe("b");
  });
});
