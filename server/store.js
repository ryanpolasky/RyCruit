import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import * as Y from "yjs";

export const validId = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{4,32}$/.test(id);
export const starters = {
  javascript:
    'const fs = require("node:fs");\n\nconsole.log("Hello, world!");\nprocess.stdout.write(fs.readFileSync(0, "utf8"));\n',
  typescript:
    'const fs = require("node:fs");\n\nconst greeting: string = "Hello, world!";\nconsole.log(greeting);\nprocess.stdout.write(fs.readFileSync(0, "utf8"));\n',
  go: 'package main\n\nimport (\n    "fmt"\n    "io"\n    "os"\n)\n\nfunc main() {\n    fmt.Println("Hello, world!")\n    io.Copy(os.Stdout, os.Stdin)\n}\n',
  ruby: 'puts "Hello, world!"\nprint STDIN.read\n',
  html: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>My page</title>\n  <style>\n    body { font-family: system-ui; padding: 24px; color: #242629; }\n    button { background: #338555; color: white; border: 0; padding: 10px 16px; cursor: pointer; }\n  </style>\n</head>\n<body>\n  <h1>Hello, web!</h1>\n  <p>Edit the HTML, CSS or script and see it here.</p>\n  <button id="hello">Say hello</button>\n  <script>\n    console.log("Page ready");\n    document.querySelector("#hello").onclick = () => {\n      console.log("Hello from the button!");\n      document.querySelector("h1").textContent = "Hello, friend!";\n    };\n  </script>\n</body>\n</html>\n',
  python:
    'import sys\n\nprint("Hello, world!")\nprint(sys.stdin.read(), end="")\n',
  cpp: '#include <iostream>\n#include <string>\n\nint main() {\n    std::cout << "Hello, world!\\n";\n    std::string line;\n    while (std::getline(std::cin, line)) std::cout << line << "\\n";\n}\n',
  java: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n        Scanner in = new Scanner(System.in);\n        while (in.hasNextLine()) System.out.println(in.nextLine());\n    }\n}\n',
};

export const PAD_TTL_MS = Number(process.env.PAD_TTL_MS || 86400000);
if (!Number.isFinite(PAD_TTL_MS) || PAD_TTL_MS <= 0)
  throw new Error("PAD_TTL_MS must be positive");

export function openStore(
  directory,
  { now = Date.now, retentionMs = PAD_TTL_MS } = {},
) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(`${directory}/rycruit.sqlite`);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS pads (id TEXT PRIMARY KEY, state BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS pad_registry (id TEXT PRIMARY KEY, createdAt INTEGER NOT NULL, createdBy TEXT NOT NULL, inviteLabel TEXT, lastActive INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, label TEXT NOT NULL, kind TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL, createdBy TEXT NOT NULL, expiresAt INTEGER, revokedAt INTEGER);
    CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('pending', 'allowed', 'blocked')), firstSeen INTEGER NOT NULL, lastSeen INTEGER NOT NULL, approvedAt INTEGER, note TEXT);
  `);
  if (
    !db
      .prepare("PRAGMA table_info(pad_registry)")
      .all()
      .some((column) => column.name === "expiresAt")
  ) {
    db.exec("ALTER TABLE pad_registry ADD COLUMN expiresAt INTEGER");
    db.prepare("UPDATE pad_registry SET expiresAt = lastActive + ?").run(
      retentionMs,
    );
  }
  db.prepare(
    "UPDATE pad_registry SET expiresAt = lastActive + ? WHERE expiresAt IS NULL",
  ).run(retentionMs);
  const at = now();
  db.prepare(
    "INSERT OR IGNORE INTO pad_registry SELECT id, ?, 'legacy', NULL, ?, ? FROM pads",
  ).run(at, at, at + retentionMs);
  const exists = (id) =>
    validId(id) &&
    Boolean(
      db
        .prepare(
          "SELECT 1 FROM pad_registry WHERE id = ? AND (expiresAt IS NULL OR expiresAt > ?)",
        )
        .get(id, now()),
    );
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
    const at = now();
    const doc = new Y.Doc();
    doc.getMap("meta").set("language", "python");
    for (const [lang, text] of Object.entries(starters))
      doc.getText(lang).insert(0, text);
    db.prepare("INSERT INTO pad_registry VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      at,
      createdBy,
      inviteLabel,
      at,
      at + retentionMs,
    );
    db.prepare("INSERT INTO pads VALUES (?, ?)").run(
      id,
      Y.encodeStateAsUpdate(doc),
    );
    doc.destroy();
    return id;
  }
  function getInvite(token) {
    if (!/^[a-zA-Z0-9_-]{43}$/.test(token)) return null;
    const invite = db.prepare("SELECT * FROM invites WHERE token=?").get(token);
    return !invite ||
      invite.revokedAt !== null ||
      (invite.expiresAt !== null && invite.expiresAt <= now()) ||
      (invite.kind === "single-use" && invite.uses > 0)
      ? null
      : invite;
  }
  return {
    exists,
    getInvite,
    seeUser(email, alwaysAllowed = false) {
      const at = now();
      db.prepare(
        "INSERT INTO users (email, status, firstSeen, lastSeen, approvedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET lastSeen=excluded.lastSeen",
      ).run(
        email,
        alwaysAllowed ? "allowed" : "pending",
        at,
        at,
        alwaysAllowed ? at : null,
      );
      if (alwaysAllowed)
        db.prepare(
          "UPDATE users SET status='allowed', approvedAt=COALESCE(approvedAt, ?) WHERE email=?",
        ).run(at, email);
      return db.prepare("SELECT * FROM users WHERE email=?").get(email);
    },
    listUsers: () =>
      db
        .prepare(
          "SELECT * FROM users ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'allowed' THEN 1 ELSE 2 END, firstSeen, email",
        )
        .all(),
    setUserStatus(email, status, note) {
      if (
        !["pending", "allowed", "blocked"].includes(status) ||
        (note !== undefined &&
          note !== null &&
          (typeof note !== "string" || note.length > 500))
      )
        throw new Error("Invalid person options");
      return (
        db
          .prepare(
            "UPDATE users SET status=?, approvedAt=?, note=CASE WHEN ? THEN ? ELSE note END WHERE email=?",
          )
          .run(
            status,
            status === "allowed" ? now() : null,
            note !== undefined ? 1 : 0,
            note ?? null,
            email,
          ).changes > 0
      );
    },
    createPad: (by) => transaction(() => insertPad(by)),
    load: (id) => db.prepare("SELECT state FROM pads WHERE id = ?").get(id),
    save(id, state) {
      db.prepare("UPDATE pads SET state = ? WHERE id = ?").run(state, id);
    },
    touch(id) {
      db.prepare("UPDATE pad_registry SET lastActive = ? WHERE id = ?").run(
        now(),
        id,
      );
    },
    connectPad(id) {
      db.prepare(
        "UPDATE pad_registry SET expiresAt = NULL, lastActive = ? WHERE id = ?",
      ).run(now(), id);
    },
    disconnectPad(id) {
      const at = now();
      db.prepare(
        "UPDATE pad_registry SET expiresAt = ?, lastActive = ? WHERE id = ?",
      ).run(at + retentionMs, at, id);
    },
    expiredPads: () =>
      db
        .prepare("SELECT id FROM pad_registry WHERE expiresAt <= ?")
        .all(now())
        .map((row) => row.id),
    sweepPads() {
      const ids = this.expiredPads();
      for (const id of ids) this.deletePad(id);
      return ids;
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
      const at = now();
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
        const invite = getInvite(token);
        if (!invite) return null;
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
          .run(now(), token).changes > 0
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
