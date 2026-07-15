import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api, type HistoryItem, type WeekStat } from "../api";
import { useAuth } from "../auth/AuthContext";
import { createQtn } from "../lv/qtns";
import { QtnNumberInput, qtnPrefix } from "../components/QtnNumberInput";

/** Post-login home: profile, weekly performance, QTN history, and quick actions
 *  (New QTN → RMU/LV, plus the Kiosk tool). */
export default function HomeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [weeks, setWeeks] = useState<WeekStat[] | null>(null);
  const [chooser, setChooser] = useState(false);

  useEffect(() => {
    api.account.history().then((r) => setHistory(r.items)).catch(() => setHistory([]));
    api.account.weekly().then((r) => setWeeks(r.weeks)).catch(() => setWeeks([]));
  }, []);

  const totalSubs = weeks?.reduce((a, w) => a + w.total, 0) ?? 0;
  const mySubs = weeks?.reduce((a, w) => a + w.mine, 0) ?? 0;

  return (
    <div className="animate-fade-up">
      {/* Greeting + quick actions */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ProfilePhoto />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
            </h1>
            <p className="text-sm text-muted">{user?.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => setChooser(true)}>+ New QTN</button>
          <button className="btn-ghost" onClick={() => navigate("/kiosks")}>🏗️ Kiosk tool</button>
          <button className="btn-ghost" onClick={() => navigate("/docs")}>📚 Docs &amp; Support</button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Performance chart */}
        <div className="card p-5 lg:col-span-2">
          <div className="mb-1 flex items-end justify-between">
            <div>
              <h2 className="sec-head">Weekly submissions</h2>
              <p className="text-xs text-muted">QTNs submitted across the team (last 8 weeks)</p>
            </div>
            <div className="text-right text-xs">
              <div><b className="text-base text-ink">{totalSubs}</b> team</div>
              <div className="text-brand-dark"><b className="text-base">{mySubs}</b> you</div>
            </div>
          </div>
          {weeks ? <WeeklyChart weeks={weeks} /> : <div className="skeleton h-40" />}
          <div className="mt-2 flex items-center gap-4 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" /> You</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-light" /> Others</span>
          </div>
        </div>

        {/* Section shortcuts */}
        <div className="grid gap-3 content-start">
          <ShortcutCard icon="⚡" title="RMU Offers History" desc="Ring Main Unit technical & commercial offers" onClick={() => navigate("/rmu")} />
          <ShortcutCard icon="📊" title="LV Offers History" desc="Low-voltage panel quotations" onClick={() => navigate("/lv")} />
          <ShortcutCard icon="📚" title="Docs & Support" desc="EEHC technical specs library + assistant" onClick={() => navigate("/docs")} />
        </div>
      </div>

      {/* QTN history */}
      <div className="mt-5 card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="sec-head mb-0">Your QTN history</h2>
          <span className="text-xs text-muted">{history?.length ?? 0} items</span>
        </div>
        {history === null ? (
          <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10" />)}</div>
        ) : history.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">
            No quotations yet — press <b className="text-ink">+ New QTN</b> to start your first one.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-brand-tint text-left text-[11px] uppercase tracking-wide text-brand-dark">
              <tr>
                <th className="px-5 py-2.5">QTN No</th>
                <th className="px-5 py-2.5">Type</th>
                <th className="px-5 py-2.5">Project</th>
                <th className="px-5 py-2.5">Customer</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={`${h.kind}-${h.id}`}
                  className="cursor-pointer border-t border-line transition-colors hover:bg-brand-tint"
                  onClick={() => navigate(h.link)}>
                  <td className="px-5 py-2.5 font-bold">
                    <span className="rounded-md bg-brand-light px-2 py-0.5 font-mono text-xs text-brand-dark">{h.number}</span>
                  </td>
                  <td className="px-5 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${h.kind === "LV" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{h.kind}</span>
                  </td>
                  <td className="px-5 py-2.5">{h.projectName || <span className="text-muted">—</span>}</td>
                  <td className="px-5 py-2.5 text-muted">{h.customer || "—"}</td>
                  <td className="px-5 py-2.5">
                    {h.submitted
                      ? <span className="text-xs font-semibold text-green-600">● Submitted</span>
                      : <span className="text-xs text-muted">○ Draft</span>}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted">{new Date(h.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {chooser && <NewQtnChooser onClose={() => setChooser(false)} />}
    </div>
  );
}

function ShortcutCard({ icon, title, desc, onClick }: { icon: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card flex items-start gap-3 p-4 text-left transition hover:border-brand/40 hover:shadow-soft">
      <span className="text-2xl">{icon}</span>
      <span>
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
    </button>
  );
}

// ── Weekly bar chart (lightweight inline SVG — no chart dependency) ────────────
function WeeklyChart({ weeks }: { weeks: WeekStat[] }) {
  const W = 560, H = 150, padX = 10, padTop = 16;
  const max = Math.max(1, ...weeks.map((w) => w.total));
  const slot = (W - padX * 2) / Math.max(1, weeks.length);
  const barW = Math.min(36, slot * 0.6);
  const baseY = H;
  const scale = (v: number) => ((H - padTop) * v) / max;
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img" aria-label="Weekly submissions">
      {[0, 0.5, 1].map((f) => {
        const y = padTop + (H - padTop) * (1 - f);
        return <line key={f} x1={padX} y1={y} x2={W - padX} y2={y} stroke="#eef0f2" strokeWidth={1} />;
      })}
      {weeks.map((w, i) => {
        const cx = padX + slot * i + slot / 2;
        const x = cx - barW / 2;
        const totalH = scale(w.total);
        const mineH = scale(w.mine);
        const others = totalH - mineH;
        return (
          <g key={i}>
            {others > 0 && <rect x={x} y={baseY - totalH} width={barW} height={others} rx={3} className="text-brand-light" fill="currentColor" />}
            {mineH > 0 && <rect x={x} y={baseY - mineH} width={barW} height={mineH} rx={3} className="text-brand" fill="currentColor" />}
            {w.total > 0 && <text x={cx} y={baseY - totalH - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#475569">{w.total}</text>}
            <text x={cx} y={baseY + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">{w.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Profile photo (upload + downscale to keep it small) ───────────────────────
function ProfilePhoto() {
  const { user, setUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = (file: File) => {
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const target = 256;
        const scale = Math.min(target / img.width, target / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        try {
          const r = await api.account.updateProfile({ photo: dataUrl });
          setUser(r.user);
        } catch {
          /* ignore */
        } finally {
          setBusy(false);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const initials = (user?.name || user?.email || "?").trim().slice(0, 1).toUpperCase();
  return (
    <div className="group relative">
      <button
        onClick={() => fileRef.current?.click()}
        title="Change profile photo"
        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-brand/30 bg-brand-tint text-2xl font-extrabold text-brand-dark"
      >
        {user?.photo && /^data:image\//.test(user.photo) ? (
          <img src={user.photo} alt="" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </button>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-ink/40 text-[10px] font-bold text-white opacity-0 transition group-hover:opacity-100">
        {busy ? "…" : "Edit"}
      </span>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </div>
  );
}

// ── New QTN chooser (RMU / LV → number) ───────────────────────────────────────
function NewQtnChooser({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"choose" | "lv" | "rmu">("choose");
  const [number, setNumber] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const start = (m: "lv" | "rmu") => { setNumber(""); setErr(""); setMode(m); };
  const create = async () => {
    if (!number.trim()) { setErr("Enter the quotation number."); return; }
    if (mode === "rmu") {
      // RMU offers are created in the offer form; carry the QTN into its cover field.
      navigate(`/offers/new?qtn=${encodeURIComponent(number)}`);
      return;
    }
    setBusy(true);
    try {
      const rec = await createQtn(number);
      navigate(`/lv/qtn/${rec.id}`);
    } catch (e) {
      setErr((e as Error).message || "Could not create the quotation.");
      setBusy(false);
    }
  };

  // Rendered via a portal to <body> so a transformed ancestor (animate-fade-up)
  // can't turn the fixed overlay into a partial, inset box.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={onClose} />
      <div role="dialog" aria-modal="true"
        className="relative w-full max-w-md rounded-xl2 border border-line bg-white p-5 shadow-lift animate-pop">
        {mode === "choose" ? (
          <>
            <h2 className="text-lg font-extrabold tracking-tight">New QTN</h2>
            <p className="mt-0.5 text-xs text-muted">What kind of quotation do you want to create?</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={() => start("rmu")}
                className="rounded-xl border-2 border-line p-4 text-left transition hover:border-brand hover:bg-brand-tint/40">
                <div className="text-2xl">⚡</div>
                <div className="mt-1 text-sm font-bold text-ink">RMU</div>
                <div className="text-[11px] text-muted">Ring Main Unit (MV)</div>
              </button>
              <button onClick={() => start("lv")}
                className="rounded-xl border-2 border-line p-4 text-left transition hover:border-brand hover:bg-brand-tint/40">
                <div className="text-2xl">📊</div>
                <div className="mt-1 text-sm font-bold text-ink">LV</div>
                <div className="text-[11px] text-muted">Low-voltage panels</div>
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-extrabold tracking-tight">New {mode === "rmu" ? "RMU" : "LV"} Quotation</h2>
            <p className="mt-0.5 text-xs text-muted">
              Type the quotation number — e.g. <b className="font-mono">{qtnPrefix()}00000</b>
            </p>
            <label className="label mt-4" htmlFor="qtn-number">Quotation number <span className="text-brand">*</span></label>
            <QtnNumberInput id="qtn-number" autoFocus value={number}
              onChange={(v) => { setNumber(v); if (err) setErr(""); }} onEnter={create} />
            {err && <p className="mt-1.5 text-xs font-semibold text-red-600">{err}</p>}
            <div className="mt-5 flex justify-between">
              <button className="btn-ghost" onClick={() => setMode("choose")}>← Back</button>
              <button className="btn-primary" onClick={create} disabled={busy || !number.trim()}>
                {busy ? "Creating…" : mode === "rmu" ? "Continue" : "Create QTN"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
