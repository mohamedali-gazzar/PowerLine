import { useEffect, useState } from "react";
import type { QtnEventDto } from "../api";
import SendForApprovalMenu from "./SendForApprovalMenu";

/**
 * The approval "chat": the reviewer's "Return for revision" comments and the creator's
 * replies (typed when re-sending for approval), shown as a two-sided conversation.
 *
 * Both sides are already recorded as audit events (`QtnEventDto`), so this reads the same
 * data the app always kept — it just presents it as a thread and gives the creator a reply
 * box wired to "Send for approval". Shared by the LV configurator and both RMU offer pages.
 *
 * A reply-less re-send stores a generated "Sent to … for approval" line; that is routing
 * noise, not a message, so it is filtered out of the conversation.
 */
const SYSTEM_SEND = /^Sent to .+ for approval$/;

type Side = "reviewer" | "creator";
interface ChatMsg { id: string; side: Side; note: string; who: string; at: string }

function toMessages(events: QtnEventDto[]): ChatMsg[] {
  return events
    .filter((e) => {
      if (e.action === "RETURN") return !!e.note;
      if (e.action === "REQUEST_APPROVAL") return !!e.note && !SYSTEM_SEND.test(e.note);
      return false;
    })
    .map((e) => ({
      id: e.id,
      side: (e.action === "RETURN" ? "reviewer" : "creator") as Side,
      note: e.note,
      who: e.actorEmail || (e.action === "RETURN" ? "Reviewer" : "Creator"),
      at: e.createdAt,
    }))
    .sort((a, b) => +new Date(a.at) - +new Date(b.at)); // oldest → newest, like a chat
}

export default function ApprovalChat({
  events,
  canReply = false,
  busy = false,
  onReSend,
  className,
}: {
  events: QtnEventDto[];
  /** Show the reply box + "Reply & send for approval" (creator, on a returned item). */
  canReply?: boolean;
  busy?: boolean;
  /** Wire to the page's own send flow; receives the chosen approver + the typed reply. */
  onReSend?: (approverId: string, note: string) => Promise<void> | void;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  // Drop any stray draft once the item is no longer returnable to the creator.
  useEffect(() => { if (!canReply) setDraft(""); }, [canReply]);

  const messages = toMessages(events);
  // Nothing to show and nothing to write → render nothing (e.g. a brand-new draft).
  if (!messages.length && !(canReply && onReSend)) return null;

  return (
    <div className={`rounded-xl2 border border-line bg-white p-4 shadow-soft no-print ${className ?? ""}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">
        💬 Approval conversation{messages.length ? ` · ${messages.length} message${messages.length === 1 ? "" : "s"}` : ""}
      </p>

      {messages.length > 0 ? (
        <ol className="mt-3 space-y-2.5">
          {messages.map((m) => (
            <li key={m.id} className={`flex ${m.side === "creator" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl border px-3 py-2 ${
                  m.side === "reviewer"
                    ? "rounded-tl-sm border-red-200 bg-red-50"
                    : "rounded-tr-sm border-sky-200 bg-sky-50"
                }`}
              >
                <p className={`text-[11px] font-bold ${m.side === "reviewer" ? "text-red-700" : "text-sky-700"}`}>
                  {m.side === "reviewer" ? "↩ Reviewer" : "↪ Creator"} · {m.who}
                </p>
                <p className={`mt-0.5 whitespace-pre-wrap text-sm ${m.side === "reviewer" ? "text-red-900" : "text-sky-900"}`}>
                  {m.note}
                </p>
                <p className="mt-1 text-[10px] text-muted">{new Date(m.at).toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted">No comments yet.</p>
      )}

      {canReply && onReSend && (
        <div className="mt-3 border-t border-line pt-3">
          <label className="text-[11px] font-bold uppercase tracking-wide text-muted">Your reply</label>
          <textarea
            className="input mt-1 h-20 w-full resize-y"
            placeholder="Reply to the reviewer's comments (optional), then send it back for approval…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <SendForApprovalMenu
              busy={busy}
              label="Reply & send for approval"
              onSend={(approverId) => onReSend(approverId, draft.trim())}
            />
          </div>
        </div>
      )}
    </div>
  );
}
