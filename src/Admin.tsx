import { useEffect, useState } from "react";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";

type PadInfo = {
  id: string;
  createdAt: number;
  createdBy: string;
  inviteLabel: string | null;
  lastActive: number;
};
type Invite = {
  token: string;
  label: string;
  kind: string;
  uses: number;
  expiresAt: number | null;
  revokedAt: number | null;
};
type Person = {
  email: string;
  status: "pending" | "allowed" | "blocked";
  firstSeen: number;
  lastSeen: number;
  approvedAt: number | null;
  note: string | null;
  isAdmin: boolean;
};
const date = (at: number | null) =>
  at === null ? "Never" : new Date(at).toLocaleString();

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`/api/admin/${path}`, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Request failed");
  return value;
}

export function Admin() {
  const [pads, setPads] = useState<PadInfo[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("single-use");
  const [days, setDays] = useState(7);
  const [copied, setCopied] = useState("");
  const [clipboardOK, setClipboardOK] = useState(false);
  async function load() {
    const [p, i, u] = await Promise.all([
      request("pads"),
      request("invites"),
      request("users"),
    ]);
    setPads(p.pads);
    setInvites(i.invites);
    setPeople(u.users);
    setLoaded(true);
  }
  useEffect(() => {
    load().catch((error) => setError(error.message));
  }, []);
  async function act(action: () => Promise<unknown>) {
    setError("");
    setWorking(true);
    try {
      await action();
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed");
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="admin-page">
      <nav className="landing-nav">
        <Wordmark />
        <div>
          <a href="/">Home</a>
          <ThemeToggle />
        </div>
      </nav>
      <main>
        <div className="admin-heading">
          <div>
            <h1>Admin</h1>
            <p>Manage people, pads and host invites.</p>
          </div>
          <a className="primary admin-new" href="/new">
            New pad
          </a>
        </div>
        {error && (
          <p className="error admin-error" role="alert">
            {error}
          </p>
        )}
        {!loaded ? (
          <p>
            {error ? (
              <button onClick={() => act(load)} disabled={working}>
                Retry
              </button>
            ) : (
              "Loading…"
            )}
          </p>
        ) : (
          <>
            <section className="admin-island" aria-label="People">
              <div className="admin-section-heading">
                <h2>
                  People <span>{people.length}</span>
                </h2>
                <button disabled={working} onClick={() => act(load)}>
                  Refresh people
                </button>
              </div>
              <p className="admin-note">
                Allow accounts to create pads. Remove returns an account to
                pending. Existing pad links still work.
              </p>
              {people.length === 0 ? (
                <p className="admin-empty">No sign-ins yet</p>
              ) : (
                <div className="table-scroll people-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Status</th>
                        <th>First seen</th>
                        <th>Last seen</th>
                        <th>Approved</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((person) => (
                        <tr key={person.email}>
                          <td>{person.email}</td>
                          <td>
                            {person.isAdmin
                              ? "Admin"
                              : person.status === "pending"
                                ? "Pending"
                                : person.status === "allowed"
                                  ? "Allowed"
                                  : "Blocked"}
                          </td>
                          <td>{date(person.firstSeen)}</td>
                          <td>{date(person.lastSeen)}</td>
                          <td>
                            {person.approvedAt
                              ? date(person.approvedAt)
                              : "Not approved"}
                          </td>
                          <td>
                            <div className="table-actions">
                              {!person.isAdmin &&
                                (person.status === "allowed" ? (
                                  <button
                                    disabled={working}
                                    onClick={() =>
                                      act(() =>
                                        request(
                                          `users/${encodeURIComponent(person.email)}`,
                                          {
                                            method: "PATCH",
                                            headers: {
                                              "Content-Type":
                                                "application/json",
                                            },
                                            body: JSON.stringify({
                                              status: "pending",
                                            }),
                                          },
                                        ),
                                      )
                                    }
                                  >
                                    Remove (pending)
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      disabled={working}
                                      onClick={() =>
                                        act(() =>
                                          request(
                                            `users/${encodeURIComponent(person.email)}`,
                                            {
                                              method: "PATCH",
                                              headers: {
                                                "Content-Type":
                                                  "application/json",
                                              },
                                              body: JSON.stringify({
                                                status: "allowed",
                                              }),
                                            },
                                          ),
                                        )
                                      }
                                    >
                                      Allow
                                    </button>
                                    {person.status !== "blocked" && (
                                      <button
                                        disabled={working}
                                        onClick={() =>
                                          act(() =>
                                            request(
                                              `users/${encodeURIComponent(person.email)}`,
                                              {
                                                method: "PATCH",
                                                headers: {
                                                  "Content-Type":
                                                    "application/json",
                                                },
                                                body: JSON.stringify({
                                                  status: "blocked",
                                                }),
                                              },
                                            ),
                                          )
                                        }
                                      >
                                        Block
                                      </button>
                                    )}
                                  </>
                                ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="admin-island">
              <div className="admin-section-heading">
                <h2>
                  Pads <span>{pads.length}</span>
                </h2>
                <button disabled={working} onClick={() => act(load)}>
                  Refresh
                </button>
              </div>
              {pads.length === 0 ? (
                <p className="admin-empty">No pads yet</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Pad</th>
                        <th>Created</th>
                        <th>By</th>
                        <th>Last active</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pads.map((pad) => (
                        <tr key={pad.id}>
                          <td className="mono">{pad.id}</td>
                          <td>{date(pad.createdAt)}</td>
                          <td>
                            {pad.createdBy}
                            {pad.inviteLabel && (
                              <span> ({pad.inviteLabel})</span>
                            )}
                          </td>
                          <td>{date(pad.lastActive)}</td>
                          <td className="table-actions">
                            <a href={`/p/${pad.id}`}>Open</a>
                            <button
                              disabled={working}
                              onClick={() => {
                                if (
                                  confirm(
                                    "Delete this pad and its code? This cannot be undone.",
                                  )
                                )
                                  void act(() =>
                                    request(`pads/${pad.id}`, {
                                      method: "DELETE",
                                    }),
                                  );
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="admin-island">
              <div className="admin-section-heading">
                <h2>
                  Invites <span>{invites.length}</span>
                </h2>
              </div>
              <form
                className="invite-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(async () => {
                    await request("invites", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ label, kind, days }),
                    });
                    setLabel("");
                  });
                }}
              >
                <label>
                  Label (optional)
                  <input
                    maxLength={80}
                    placeholder="Shua"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </label>
                <label>
                  Kind
                  <select
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                  >
                    <option value="single-use">Single use</option>
                    <option value="expiring">Expires after N days</option>
                  </select>
                </label>
                {kind === "expiring" && (
                  <label>
                    Days
                    <input
                      type="number"
                      min={1}
                      max={365}
                      required
                      value={days}
                      onChange={(event) => setDays(Number(event.target.value))}
                    />
                  </label>
                )}
                <button className="primary" disabled={working}>
                  Create invite
                </button>
              </form>
              {invites.length === 0 ? (
                <p className="admin-empty">No invites yet</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Label</th>
                        <th>Kind</th>
                        <th>Uses</th>
                        <th>Expires</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invites.map((invite) => {
                        const unavailable =
                          invite.revokedAt !== null ||
                          (invite.kind === "single-use" && invite.uses > 0) ||
                          (invite.expiresAt !== null &&
                            invite.expiresAt <= Date.now());
                        return (
                          <tr key={invite.token}>
                            <td>{invite.label || "Unlabeled"}</td>
                            <td>
                              {invite.kind === "single-use"
                                ? "Single use"
                                : "Expiring"}
                            </td>
                            <td>{invite.uses}</td>
                            <td>{date(invite.expiresAt)}</td>
                            <td>
                              {invite.revokedAt
                                ? "Revoked"
                                : invite.expiresAt !== null &&
                                    invite.expiresAt <= Date.now()
                                  ? "Expired"
                                  : unavailable
                                    ? "Used"
                                    : "Active"}
                            </td>
                            <td className="table-actions">
                              <button
                                disabled={unavailable || working}
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(
                                      `${location.origin}/i/${invite.token}`,
                                    );
                                    setCopied(invite.token);
                                    setClipboardOK(true);
                                  } catch {
                                    setError(
                                      "Clipboard unavailable. Use the invite link below.",
                                    );
                                    setCopied(invite.token);
                                    setClipboardOK(false);
                                  }
                                }}
                              >
                                {copied === invite.token
                                  ? clipboardOK
                                    ? "Copied"
                                    : "Link shown"
                                  : "Copy link"}
                              </button>
                              <button
                                disabled={invite.revokedAt !== null || working}
                                onClick={() =>
                                  act(() =>
                                    request(`invites/${invite.token}/revoke`, {
                                      method: "POST",
                                    }),
                                  )
                                }
                              >
                                Revoke
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {copied && (
                <p className="invite-link">
                  Invite link:{" "}
                  <a href={`/i/${copied}`}>
                    {location.origin}/i/{copied}
                  </a>
                </p>
              )}
              <p className="admin-note">
                Create pad on an invite page creates the pad. Single-use links
                work once; expiring links can be reused until they expire.
                Revoking an invite does not delete its pads.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
