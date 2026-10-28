import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import * as Y from "yjs";

export const validId = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{4,32}$/.test(id);
export const starters = {
  python:
    'import sys\n\nprint("Hello, world!")\nprint(sys.stdin.read(), end="")\n',
  cpp: '#include <iostream>\n#include <string>\n\nint main() {\n    std::cout << "Hello, world!\\n";\n    std::string line;\n    while (std::getline(std::cin, line)) std::cout << line << "\\n";\n}\n',
  java: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n        Scanner in = new Scanner(System.in);\n        while (in.hasNextLine()) System.out.println(in.nextLine());\n    }\n}\n',
};

export function openStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(`${directory}/rycruit.sqlite`);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS pads (id TEXT PRIMARY KEY, state BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS pad_registry (id TEXT PRIMARY KEY, createdAt INTEGER NOT NULL, createdBy TEXT NOT NULL, inviteLabel TEXT, lastActive INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, label TEXT NOT NULL, kind TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL, createdBy TEXT NOT NULL, expiresAt INTEGER, revokedAt INTEGER);
  `);
  const now = Date.now();
  db.prepare(
    "INSERT OR IGNORE INTO pad_registry SELECT id, ?, 'legacy', NULL, ? FROM pads",
  ).run(now, now);
  const exists = (id) =>
    validId(id) &&
    Boolean(db.prepare("SELECT 1 FROM pad_registry WHERE id = ?").get(id));
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function insertPad(createdBy, inviteLabel = null) {
    const id = randomBytes(18).toString("base64url");
    const at = Date.now();
    const doc = new Y.Doc();
    doc.getMap("meta").set("language", "python");
    for (const [lang, text] of Object.entries(starters))
      doc.getText(lang).insert(0, text);
    db.prepare("INSERT INTO pad_registry VALUES (?, ?, ?, ?, ?)").run(
      id,
      at,
      createdBy,
      inviteLabel,
      at,
    );
    db.prepare("INSERT INTO pads VALUES (?, ?)").run(
      id,
      Y.encodeStateAsUpdate(doc),
    );
    doc.destroy();
    return id;
  }
  return {
    exists,
    createPad: (by) => transaction(() => insertPad(by)),
    load: (id) => db.prepare("SELECT state FROM pads WHERE id = ?").get(id),
    save(id, state) {
      db.prepare("UPDATE pads SET state = ? WHERE id = ?").run(state, id);
    },
    touch(id) {
      db.prepare("UPDATE pad_registry SET lastActive = ? WHERE id = ?").run(
        Date.now(),
        id,
      );
    },
    listPads: () =>
      db
        .prepare("SELECT * FROM pad_registry ORDER BY createdAt DESC, id")
        .all(),
    listInvites: () =>
      db.prepare("SELECT * FROM invites ORDER BY createdAt DESC, token").all(),
    createInvite({ label = "", kind, days }, by) {
      if (
        typeof label !== "string" ||
        label.length > 80 ||
        !["single-use", "expiring"].includes(kind) ||
        (kind === "expiring" &&
          (!Number.isInteger(days) || days < 1 || days > 365))
      )
        throw new Error("Invalid invite options");
      const token = randomBytes(32).toString("base64url");
      const at = Date.now();
      db.prepare(
        "INSERT INTO invites (token, label, kind, createdAt, createdBy, expiresAt) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        token,
        label.trim(),
        kind,
        at,
        by,
        kind === "expiring" ? at + days * 86400000 : null,
      );
      return db.prepare("SELECT * FROM invites WHERE token = ?").get(token);
    },
    redeemInvite(token) {
      if (!/^[a-zA-Z0-9_-]{43}$/.test(token)) return null;
      return transaction(() => {
        const invite = db
          .prepare("SELECT * FROM invites WHERE token = ?")
          .get(token);
        if (
          !invite ||
          invite.revokedAt ||
          (invite.expiresAt !== null && invite.expiresAt <= Date.now()) ||
          (invite.kind === "single-use" && invite.uses > 0)
        )
          return null;
        db.prepare("UPDATE invites SET uses = uses + 1 WHERE token = ?").run(
          token,
        );
        return insertPad(`invite:${invite.createdBy}`, invite.label || null);
      });
    },
    revokeInvite(token) {
      return (
        db
          .prepare(
            "UPDATE invites SET revokedAt = COALESCE(revokedAt, ?) WHERE token = ?",
          )
          .run(Date.now(), token).changes > 0
      );
    },
    deletePad(id) {
      return transaction(() => {
        db.prepare("DELETE FROM pads WHERE id = ?").run(id);
        return (
          db.prepare("DELETE FROM pad_registry WHERE id = ?").run(id).changes >
          0
        );
      });
    },
    close: () => db.close(),
  };
}
