import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, QTN_STATUS_STYLE, type QtnStatus, type QtnEventDto } from "../api";
import { useAuth } from "../auth/AuthContext";
import OfferView from "../components/OfferView";
import CommercialView from "../components/CommercialView";
import OfferCover from "../components/OfferCover";
import SendForApprovalMenu from "../components/SendForApprovalMenu";
import ActiveTimeBadge from "../components/ActiveTimeBadge";
import { useReviewLock } from "../hooks/useReviewLock";
import type { Offer } from "../types";

export default function OfferDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"technical" | "commercial">("technical");
  // Saved history of every "Return for revision" (from the offer's audit trail).
  const [returnHistory, setReturnHistory] = useState<QtnEventDto[]>([]);

  useEffect(() => {
    if (!id) return;
    api.getOffer(id).then(setOffer).catch((e) => setError((e as Error).message));
  }, [id]);
  useEffect(() => {
    api.access.me().then((a) => setPerms(a.perms)).catch(() => {});
  }, []);
  // Load the return-for-revision history; refresh whenever the status changes so a
  // new return appears immediately. Endpoint is owner/approver-gated → 403 = empty.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    api.offerEvents(id)
      .then((evs) => { if (alive) setReturnHistory(evs.filter((e) => e.action === "RETURN")); })
      .catch(() => { if (alive) setReturnHistory([]); });
    return () => { alive = false; };
  }, [id, offer?.status]);

  // Review lock — while an approver is reviewing a waiting offer, others can't act on it.
  const lock = useReviewLock(
    offer?.id,
    !!offer && (offer.status || "DRAFT") === "WAITING_APPROVAL" && perms.includes("qtn.approve"),
  );

  if (error)
    return <div className="card border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  if (!offer)
    return (
      <div className="space-y-3">
        <div className="skeleton h-20" />
        <div className="skeleton h-64" />
      </div>
    );

  const pdfHref =
    tab === "technical" ? api.pdfUrl(offer.id) : api.commercialPdfUrl(offer.id);

  // ── Approval workflow (same lifecycle + rules as LV) ──────────────────────
  const status = (offer.status || "DRAFT") as QtnStatus;
  const isOwner = !!user && offer.ownerId === user.id;
  const has = (p: string) => perms.includes(p);
  // Another approver is reviewing this right now → block review actions until they're done.
  const lockedByOther = !lock.mine && !!lock.heldBy;

  async function move(to: QtnStatus, opts: { reason?: boolean; approverId?: string } = {}) {
    if (!offer) return;
    let note = "";
    if (opts.reason) {
      note = (window.prompt("Reason for returning this offer for revision:") ?? "").trim();
      if (!note) return; // a reason is required to return
    }
    setBusy(true);
    setActionErr(null);
    try {
      await api.transitionOffer(offer.id, to, note, opts.approverId);
      setOffer(await api.getOffer(offer.id)); // reflect the new status + lock
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Which moves this user may make now. The server is authoritative; this just
  // decides which buttons to show (mirrors offerTransitionDenial on the backend).
  const actions: { to: QtnStatus; label: string; primary?: boolean; reason?: boolean; send?: boolean }[] = [];
  if ((status === "DRAFT" || status === "RETURNED") && isOwner)
    actions.push({ to: "WAITING_APPROVAL", label: "Send for approval", primary: true, send: true });
  if (status === "WAITING_APPROVAL") {
    if (has("qtn.approve")) {
      actions.push({ to: "APPROVED", label: "Approve", primary: true });
      actions.push({ to: "RETURNED", label: "Return for revision", reason: true });
    }
    if (isOwner) actions.push({ to: "DRAFT", label: "Withdraw" });
  }
  if (status === "APPROVED") {
    if (isOwner || has("qtn.submitApproved")) actions.push({ to: "SUBMITTED", label: "Submit", primary: true });
    // The approver can retract their approval while it hasn't been submitted yet.
    if (has("qtn.approve")) actions.push({ to: "WAITING_APPROVAL", label: "Withdraw approval" });
    if (isOwner) actions.push({ to: "DRAFT", label: "Withdraw" });
  }
  if (status === "SUBMITTED" && has("qtn.reopen"))
    actions.push({ to: "DRAFT", label: "Reopen" });

  return (
    <div className="animate-fade-up">
      <Link to="/lv" className="text-sm font-semibold text-brand hover:underline">
        ← All offers
      </Link>

      {/* Hero header */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-line bg-white p-5 shadow-soft">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{offer.quotationNo || offer.offerNumber}</h1>
            <span className="code-chip">{offer.generated.panelCode}</span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${QTN_STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600"}`}>
              {offer.statusLabel ?? status}
            </span>
            {/* Recorded active working time on this offer (display only — building happens in the editor). */}
            <ActiveTimeBadge qtnId={offer.id} initialSeconds={offer.activeSeconds ?? 0} enabled={false} kind="rmu" />
          </div>
          <p className="mt-1 text-sm text-muted">
            {offer.projectName} · {offer.customer}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {offer.rmu.productType === "PSEC" && (
            <a href={api.sldPdfUrl(offer.id)} target="_blank" rel="noreferrer" className="btn-ghost">
              ⬇ SLD PDF
            </a>
          )}
          <a href={pdfHref} target="_blank" rel="noreferrer" className="btn-primary">
            ⬇ {tab === "technical" ? "Technical" : "Commercial"} PDF
          </a>
        </div>
      </div>

      {/* Approval workflow — Send for approval → Return → Approve → Submit, like LV */}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl2 border border-line bg-white p-4 shadow-soft">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Approval</span>
        {status === "RETURNED" && offer.returnReason && (
          <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
            Returned: {offer.returnReason}
          </span>
        )}
        {(status === "APPROVED" || status === "SUBMITTED") && offer.approverEmail && (
          <span className="text-xs text-muted">Approved by {offer.approverEmail}</span>
        )}
        {lockedByOther && (
          <span className="flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
            🔒 {lock.heldBy!.name || lock.heldBy!.email} is reviewing this now
            {has("access.manage") && (
              <button type="button" className="rounded border border-amber-300 px-1.5 py-0.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100" onClick={lock.takeOver}>
                Take over
              </button>
            )}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {actions.length === 0 ? (
            <span className="text-xs text-muted">No actions available at this stage.</span>
          ) : (
            actions.map((a) =>
              a.send ? (
                <SendForApprovalMenu
                  key={a.to + a.label}
                  busy={busy}
                  onSend={(approverId) => move("WAITING_APPROVAL", { approverId })}
                />
              ) : (
                <button
                  key={a.to + a.label}
                  type="button"
                  disabled={busy || (lockedByOther && (a.to === "APPROVED" || a.to === "RETURNED"))}
                  title={lockedByOther && (a.to === "APPROVED" || a.to === "RETURNED") ? `${lock.heldBy!.name || lock.heldBy!.email} is reviewing this` : undefined}
                  className={`${a.primary ? "btn-primary" : "btn-ghost"} disabled:cursor-not-allowed disabled:opacity-50`}
                  onClick={() => move(a.to, { reason: a.reason })}
                >
                  {busy ? "…" : a.label}
                </button>
              )
            )
          )}
        </div>
      </div>
      {actionErr && <p className="mt-2 text-sm font-semibold text-red-600">{actionErr}</p>}

      {/* Saved revision history — every "Return for revision" comment, newest first. */}
      {returnHistory.length > 0 && (
        <div className="mt-3 rounded-xl2 border border-line bg-white p-4 shadow-soft">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            ↩ Revision history · {returnHistory.length} return{returnHistory.length === 1 ? "" : "s"} for revision
          </p>
          <ol className="mt-2 space-y-2">
            {[...returnHistory].reverse().map((e) => (
              <li key={e.id} className="rounded-lg border border-red-200 bg-red-50/70 px-3 py-2">
                <p className="whitespace-pre-wrap text-sm text-red-900">{e.note || "(no comment)"}</p>
                <p className="mt-1 text-[11px] text-red-700">
                  — {e.actorEmail || "unknown"} · {new Date(e.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-4 flex gap-1 border-b border-line">
        {(["technical", "commercial"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold capitalize transition-colors ${
              tab === t
                ? "border-brand text-brand-dark"
                : "border-transparent text-muted hover:text-brand-dark"
            }`}
          >
            {t} offer
          </button>
        ))}
      </div>

      {/* Branded cover + A4 document, exactly like the exported PDF. */}
      <div className="mt-4 overflow-x-auto">
        <div className="mx-auto w-fit space-y-5">
          <OfferCover
            kind={tab === "technical" ? "Technical" : "Commercial"}
            date={offer.offerDate ?? offer.createdAt.slice(0, 10)}
            qtnRef={offer.quotationNo ?? offer.offerNumber}
            optyNo={offer.opportunityNo}
            projectName={offer.projectName}
            customer={offer.customer}
            contacts={[
              { role: "Sales", name: offer.salesName, phone: offer.salesMobile, email: offer.salesEmail },
              { role: "Manager", name: offer.salesManagerName, phone: offer.salesManagerMobile, email: offer.salesManagerEmail },
              { role: "Support", name: offer.supportName, phone: offer.supportMobile, email: offer.supportEmail },
            ]}
          />
          <div className="a4-sheet px-12 py-10">
            {tab === "technical" ? (
              <OfferView g={offer.generated} />
            ) : offer.commercial ? (
              <CommercialView c={offer.commercial} />
            ) : (
              <p className="text-muted">No commercial data.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
