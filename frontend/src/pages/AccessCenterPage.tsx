import { useEffect, useMemo, useState } from "react";
import { api, type AccessUser, type MyAccess, type PriceChangeRow, type RolePreset } from "../api";
import { useAuth } from "../auth/AuthContext";

// Access Center — who is an admin, and what each engineer is allowed to do.
//
// Tier is the coarse switch, the ticks are the fine one, and the ticks only
// mean anything for engineers: an admin already holds everything, so an
// editable tick there would promise a trim that the server will not honour.
// The single exception is approving your own quotations — deliberately NOT
// implied by admin, so it stays a real tick at every tier.

const ADMIN_EXCEPTION = "qtn.approveOwn";
const CUSTOM_ROLE = "Custom";

// Fallback role presets used until the server catalogue loads. The backend
// (middleware/roles.ts) is the source of truth; these keep the UI usable meanwhile.
const DEFAULT_ROLES: RolePreset[] = [
  { name: "Admin", tier: "ADMIN", perms: [] },
  { name: "Section Head", tier: "ADMIN", perms: [] },
  { name: "Team Leader", tier: "ENGINEER", perms: ["prices.view", "qtn.viewAll", "qtn.reassign", "qtn.approve", "qtn.return", "qtn.amendOwn", "qtn.amendAll"] },
  { name: "Tendering", tier: "ENGINEER", perms: ["prices.view", "qtn.viewAll", "qtn.editWaiting", "qtn.amendOwn", "qtn.amendAll"] },
  { name: "Powerline", tier: "ENGINEER", perms: ["qtn.viewAll"] },
];

type Draft = { role: string; perms: string[]; notifyByEmail: boolean };
type RowNote = { ok: boolean; text: string };

export default function AccessCenterPage() {
  const { user: signedIn } = useAuth();
  const [me, setMe] = useState<MyAccess | null>(null);
  const [gateError, setGateError] = useState("");
  const [users, setUsers] = useState<AccessUser[] | null>(null);
  const [usersError, setUsersError] = useState("");
  const [permList, setPermList] = useState<{ key: string; label: string }[]>([]);
  const [roles, setRoles] = useState<RolePreset[]>(DEFAULT_ROLES);
  const [history, setHistory] = useState<PriceChangeRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [notes, setNotes] = useState<Record<string, RowNote>>({});
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.access
      .me()
      .then((m) => {
        setMe(m);
        if (!m.perms.includes("access.manage")) return;
        // Fired independently rather than in a Promise.all: a missing history or
        // permission catalogue must still leave a usable user list on screen.
        api.access
          .users()
          .then((r) => setUsers(r.users))
          .catch((e) => {
            setUsers([]);
            setUsersError((e as Error).message);
          });
        api.access
          .catalogue()
          .then((c) => {
            setPermList(c.perms);
            if (c.roles?.length) setRoles(c.roles);
          })
          .catch(() => {});
        api.access
          .history()
          .then((r) => setHistory(r.items))
          .catch(() => setHistory([]));
      })
      .catch((e) => setGateError((e as Error).message));
  }, []);

  const draftFor = (u: AccessUser): Draft => drafts[u.id] ?? { role: u.accessRole, perms: u.perms, notifyByEmail: u.notifyByEmail };

  const clearNote = (id: string) =>
    setNotes((n) => {
      const next = { ...n };
      delete next[id];
      return next;
    });

  const discard = (id: string) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });

  const edit = (u: AccessUser, patch: Partial<Draft>) => {
    const base = draftFor(u);
    setDrafts((d) => ({ ...d, [u.id]: { ...base, ...patch } }));
    clearNote(u.id);
  };

  const isDirty = (u: AccessUser) => {
    const d = drafts[u.id];
    if (!d) return false;
    return (
      d.role !== u.accessRole ||
      d.notifyByEmail !== u.notifyByEmail ||
      d.perms.length !== u.perms.length ||
      d.perms.some((p) => !u.perms.includes(p))
    );
  };

  const save = async (u: AccessUser) => {
    const d = drafts[u.id];
    if (!d) return;
    setBusy(u.id);
    clearNote(u.id);
    try {
      await api.access.setAccess(u.id, { role: d.role, perms: d.perms, notifyByEmail: d.notifyByEmail });
      // Re-read rather than patch locally: changing tier can rewrite the stored
      // permissions, so only the server knows what this user now holds.
      const r = await api.access.users();
      setUsers(r.users);
      discard(u.id);
      setNotes((n) => ({ ...n, [u.id]: { ok: true, text: "Saved" } }));
      api.access.history().then((h) => setHistory(h.items)).catch(() => {});
      api.access.me().then(setMe).catch(() => {}); // you may have just changed your own access
    } catch (e) {
      // The server refused — drop the edit. Leaving the attempted value on
      // screen reads as saved, which is how someone ends up believing they
      // removed an admin they did not.
      discard(u.id);
      setNotes((n) => ({ ...n, [u.id]: { ok: false, text: (e as Error).message } }));
    } finally {
      setBusy("");
    }
  };

  const filtered = useMemo(() => {
    if (!users) return null;
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q));
  }, [users, query]);

  if (!me && !gateError) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-20" />
        <div className="skeleton h-64" />
      </div>
    );
  }

  // ── No access ──────────────────────────────────────────────────────────────
  if (!me || !me.perms.includes("access.manage")) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-extrabold tracking-tight">Access Center</h1>
        <div className="card mt-4 p-6 text-center">
          <div className="text-3xl">🔒</div>
          <p className="mt-2 font-bold text-ink">You don't have access to user management</p>
          <p className="mt-1 text-sm text-muted">
            Ask an admin to give you access. You can keep using the app normally — offers and
            quotations are unaffected.
          </p>
          {gateError && <p className="mt-2 text-xs text-muted">{gateError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">Access Center</h1>
        <p className="text-sm text-muted">
          Give each person a role — it sets what they can do. Pick “Custom” to hand-tick
          permissions instead. Changes take effect on their next click.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          className="input max-w-md"
          placeholder="Search by name, email or role…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {filtered && (
          <span className="text-xs text-muted">
            {filtered.length} of {users?.length ?? 0} {users?.length === 1 ? "person" : "people"}
          </span>
        )}
      </div>

      {usersError && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{usersError}</p>
      )}

      {!filtered && <div className="skeleton h-64" />}
      {filtered && filtered.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">
          {users && users.length > 0 ? "Nobody matches that search." : "No users yet."}
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              draft={draftFor(u)}
              perms={permList}
              roles={roles}
              dirty={isDirty(u)}
              busy={busy === u.id}
              note={notes[u.id]}
              isSelf={u.id === signedIn?.id}
              onEdit={(patch) => edit(u, patch)}
              onSave={() => save(u)}
              onDiscard={() => {
                discard(u.id);
                clearNote(u.id);
              }}
            />
          ))}
        </div>
      )}

      {/* ── Who changed what ─────────────────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="sec-head">Access history</h2>
        {!history && <div className="skeleton h-32" />}
        {history && history.length === 0 && (
          <div className="card p-6 text-center text-sm text-muted">No access changes recorded yet.</div>
        )}
        {history && history.length > 0 && (
          <div className="card overflow-hidden">
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand-tint text-left text-[11px] uppercase tracking-wide text-brand-dark">
                  <tr>
                    <th className="px-4 py-2">Person</th>
                    <th className="px-4 py-2">What changed</th>
                    <th className="px-4 py-2">From</th>
                    <th className="px-4 py-2">To</th>
                    <th className="px-4 py-2">Changed by</th>
                    <th className="px-4 py-2">When</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-t border-line">
                      <td className="px-4 py-2 font-medium text-ink">{h.label}</td>
                      <td className="px-4 py-2 font-mono text-[11px] text-muted">{h.field}</td>
                      <td className="px-4 py-2 text-xs text-muted">{h.oldValue || "—"}</td>
                      <td className="px-4 py-2 text-xs font-semibold text-ink">{h.newValue || "—"}</td>
                      <td className="px-4 py-2 text-xs text-muted">{h.actorEmail || "unknown"}</td>
                      <td className="px-4 py-2 text-xs text-muted">
                        {new Date(h.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** One person: their tier, their ticks, and whatever the server said about the
 *  last attempt to change them. */
function UserCard({
  user,
  draft,
  perms,
  roles,
  dirty,
  busy,
  note,
  isSelf,
  onEdit,
  onSave,
  onDiscard,
}: {
  user: AccessUser;
  draft: Draft;
  perms: { key: string; label: string }[];
  roles: RolePreset[];
  dirty: boolean;
  busy: boolean;
  note?: RowNote;
  isSelf: boolean;
  onEdit: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const preset = roles.find((r) => r.name === draft.role);
  const isAdminRole = preset?.tier === "ADMIN";
  const isCustom = !preset; // "Custom" (or unknown) → ticks are editable

  const toggle = (key: string, on: boolean) =>
    onEdit({ perms: on ? [...draft.perms, key] : draft.perms.filter((p) => p !== key) });

  // How each permission tick appears for the current role.
  const tick = (key: string): { checked: boolean; disabled: boolean } => {
    if (isAdminRole) return { checked: key !== ADMIN_EXCEPTION, disabled: true }; // admin holds all
    if (preset) return { checked: preset.perms.includes(key), disabled: true };   // fixed engineer role
    return { checked: draft.perms.includes(key), disabled: busy };                // Custom → editable
  };

  const pickRole = (name: string) => {
    const p = roles.find((r) => r.name === name);
    // A preset fills in its permissions; Custom keeps the current ones to fine-tune.
    onEdit(p ? { role: p.name, perms: [...p.perms] } : { role: CUSTOM_ROLE });
  };

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">
            {user.name || user.email}
            {isSelf && (
              <span className="ml-2 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-dark">
                You
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted">{user.email}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            Joined {new Date(user.createdAt).toLocaleDateString()}
          </p>
          {!user.migrated && (
            <p
              className="mt-1 text-[11px] font-semibold text-amber-700"
              title="This account predates tiers and permissions — the server still reads its old role."
            >
              Still on the legacy role “{user.role || "USER"}”
            </p>
          )}
        </div>
        <div className="shrink-0">
          <label className="label" htmlFor={`role-${user.id}`}>
            Role
          </label>
          <select
            id={`role-${user.id}`}
            className="input w-52"
            value={draft.role || CUSTOM_ROLE}
            disabled={busy}
            onChange={(e) => pickRole(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
            <option value={CUSTOM_ROLE}>Custom…</option>
          </select>

          {/* Turning this off does not silence the person � the in-app bell still
              fills. It only decides whether a copy is also e-mailed. */}
          <label className="mt-3 flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={draft.notifyByEmail}
              disabled={busy}
              onChange={(e) => onEdit({ notifyByEmail: e.target.checked })}
            />
            <span>
              Email notifications
              <span className="block text-[11px] text-muted">
                {draft.notifyByEmail
                  ? "Gets workflow emails as well as in-app alerts"
                  : "In-app alerts only � no email"}
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <p className="mb-2 text-xs text-muted">
          {isAdminRole
            ? "This role holds every permission — approving your own quotations stays a separate opt-in."
            : isCustom
            ? "Custom — tick exactly what this person may do."
            : "Permissions this role grants. Switch to “Custom” to hand-pick."}
        </p>
        {perms.length === 0 ? (
          <p className="text-xs text-muted">
            The permission list could not be loaded. The role can still be changed.
          </p>
        ) : (
          <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {perms.map((p) => {
              const t = tick(p.key);
              return (
                <label
                  key={p.key}
                  className={`flex items-center gap-2 text-sm ${t.disabled ? "text-muted" : "text-ink"}`}
                  title={p.key}
                >
                  <input
                    type="checkbox"
                    className="shrink-0"
                    checked={t.checked}
                    disabled={t.disabled}
                    onChange={(e) => toggle(p.key, e.target.checked)}
                  />
                  <span className="truncate">{p.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={!dirty || busy} onClick={onSave}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        {dirty && !busy && (
          <button className="btn-ghost" onClick={onDiscard}>
            Discard
          </button>
        )}
        {note && (
          <p className={`text-sm font-semibold ${note.ok ? "text-green-700" : "text-red-700"}`}>
            {note.text}
          </p>
        )}
        {isSelf && isAdminRole && !note && (
          <p className="text-xs text-muted">You cannot remove your own admin access.</p>
        )}
      </div>
    </div>
  );
}
