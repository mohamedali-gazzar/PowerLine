import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import {
  loadDocsData,
  localSearch,
  detectTopics,
  topicById,
  TOPICS,
  type DocInfo,
  type SearchHit,
} from "../docs/search";

// Docs & Support — technical-document library + smart support chat.
//
// How answering works (RAG): for EVERY question the browser first retrieves the
// most relevant passages from the local document index (instant, free), then
// sends question + passages + recent turns to the AI, which composes an
// accurate answer grounded in OUR documents — it never reads whole files.
// If the AI is unavailable (no key / error), the chat falls back to showing
// the closest document passage directly, so it always answers something.
//
// To reduce wrong-family answers the chat is TOPIC-AWARE: the user can pick a
// topic (MVSG, RMU, CT/VT, …) so retrieval is scoped to that family, and even
// in "All" mode the topic is auto-detected from the wording (incl. shorthand
// like MVSG / RMU / CT-VT) so answers still land on the right documents.

// Short chip labels for the topic bar (full labels live in search.ts TOPICS).
const SHORT: Record<string, string> = {
  switchgear: "MVSG",
  rmu: "RMU",
  breakers: "Breakers",
  lvpanels: "LV Panels",
  pfc: "PFC",
  transformers: "CT/VT",
  kiosks: "Kiosks",
  meters: "Meters",
};

interface ChatSource {
  doc: DocInfo;
  page: number;
}

interface ChatMsg {
  role: "user" | "ai" | "doc" | "noMatch" | "error";
  text: string;
  sources?: ChatSource[];
  note?: string;
  topicTag?: string; // topic recognised for a user message (picked or detected)
  pending?: boolean;
}

/** AI call — retrieval-grounded; the only place the AI API is used. */
async function callSupportAI(
  question: string,
  hits: SearchHit[],
  history: { role: "user" | "assistant"; text: string }[],
  topicLabel?: string
): Promise<string> {
  const context = hits.slice(0, 8).map((h) => ({
    doc: h.doc.name,
    page: h.page,
    text: h.text.slice(0, 4000),
  }));
  const r = await api.support.ai(question, context, history, topicLabel);
  return r.answer;
}

export default function DocsPage() {
  const [docs, setDocs] = useState<DocInfo[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [topic, setTopic] = useState<string>("all"); // "all" or a Topic id
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "ai",
      text:
        "👋 Hi — I'm the PowerLine specifications assistant. Pick a topic below to keep answers " +
        "focused (MV Switchgear, RMU, Meters, CT/VT, Kiosks, LV Panels, Breakers, PFC), or just " +
        "ask. I understand shorthand too — MVSG, RMU, CT/VT, LV, PFC — and I answer from our EEHC " +
        "documents. What would you like to know?",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDocsData()
      .then(({ docs }) => setDocs(docs))
      .catch((e) => setLoadErr((e as Error).message));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const categories = useMemo(() => {
    if (!docs) return [];
    const map = new Map<string, DocInfo[]>();
    for (const d of docs) {
      if (!map.has(d.category)) map.set(d.category, []);
      map.get(d.category)!.push(d);
    }
    return [...map.entries()];
  }, [docs]);

  /** Last few turns (user + assistant) so follow-up questions keep meaning. */
  const recentHistory = (msgs: ChatMsg[]) =>
    msgs
      .filter((m) => !m.pending && (m.role === "user" || m.role === "ai" || m.role === "doc"))
      .slice(-6)
      .map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        text: m.text.slice(0, 1500),
      }));

  const pickTopic = (id: string) => {
    setTopic(id);
    if (id !== "all") {
      const t = topicById(id);
      if (t)
        setMessages((m) => [
          ...m,
          {
            role: "ai",
            text: `Focused on ${t.emoji} ${t.label}. I'll answer only from these documents — ask away, or switch topic anytime above.`,
          },
        ]);
    }
  };

  const send = async () => {
    const q = input.trim();
    if (!q || busy || !docs) return;
    setInput("");
    setBusy(true);
    const history = recentHistory(messages);

    // Topic in effect: an explicit pick, otherwise auto-detected from the wording
    // (so the chat visibly "knows" a question about MVSG / RMU / CT-VT / …).
    const active = topic !== "all" ? topicById(topic) : detectTopics(q)[0];
    const topicTag = active ? `${active.emoji} ${active.label}` : undefined;
    const topicLabel = active?.label;

    setMessages((m) => [
      ...m,
      { role: "user", text: q, topicTag },
      { role: "ai", text: "", pending: true },
    ]);
    try {
      // 1) Retrieve the relevant passages locally (instant, no AI). Scoped to the
      //    picked topic; in "all" mode the engine auto-detects + boosts the family.
      const { hits } = await localSearch(q, 8, topic);
      const sources = dedupeSources(hits).slice(0, 3);
      try {
        // 2) AI composes the answer from those passages (every message).
        const answer = await callSupportAI(q, hits, history, topicLabel);
        setMessages((m) =>
          m.map((msg) => (msg.pending ? { role: "ai", text: answer, sources } : msg))
        );
      } catch (e) {
        const err = e as Error & { status?: number };
        // AI unavailable → fall back to the closest document passage.
        if (hits.length > 0) {
          setMessages((m) =>
            m.map((msg) =>
              msg.pending
                ? {
                    role: "doc",
                    text: hits[0].text,
                    sources,
                    note:
                      err.status === 503
                        ? "AI assistant is off — showing the closest passage from the documents."
                        : "AI didn't respond — showing the closest passage from the documents.",
                  }
                : msg
            )
          );
        } else {
          setMessages((m) =>
            m.map((msg) =>
              msg.pending
                ? {
                    role: "noMatch",
                    text: "I couldn't find anything about that in our documents.",
                    note: err.status === 503 ? "AI assistant is off." : err.message,
                  }
                : msg
            )
          );
        }
      }
    } catch (e) {
      setMessages((m) =>
        m.map((msg) => (msg.pending ? { role: "error", text: (e as Error).message } : msg))
      );
    } finally {
      setBusy(false);
    }
  };

  const activeTopic = topic !== "all" ? topicById(topic) : undefined;

  return (
    <div className="animate-fade-up">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">Docs &amp; Support</h1>
        <p className="text-sm text-muted">
          EEHC technical specifications — browse the library or ask the assistant.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,1fr)_2fr]">
        {/* ── Document library ─────────────────────────────────────────── */}
        <div className="card max-h-[calc(100vh-12rem)] overflow-y-auto p-4 lg:sticky lg:top-20 lg:self-start">
          <h2 className="sec-head">Document library</h2>
          {loadErr && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{loadErr}</p>}
          {!docs && !loadErr && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-9" />)}</div>}
          {categories.map(([cat, list]) => (
            <details key={cat} className="group mb-1.5" open={categories.length <= 3}>
              <summary className="flex cursor-pointer items-center justify-between rounded-lg bg-brand-tint/60 px-3 py-2 text-sm font-bold text-brand-dark transition hover:bg-brand-tint">
                <span>{cat}</span>
                <span className="text-[11px] font-semibold text-muted">{list.length}</span>
              </summary>
              <ul className="mt-1 space-y-0.5 pl-1">
                {list.map((d) => (
                  <li key={d.id}>
                    <a
                      href={`/${d.file}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 text-[13px] leading-snug text-ink transition hover:bg-surface"
                      title={`Open PDF (${d.kb} KB)`}
                    >
                      <span className="mt-0.5 shrink-0">📄</span>
                      <span dir="auto">
                        {d.name}
                        {d.pages > 0 && <span className="ml-1 text-[11px] text-muted">· {d.pages}p</span>}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>

        {/* ── Support chat ─────────────────────────────────────────────── */}
        <div className="card flex max-h-[calc(100vh-12rem)] min-h-[420px] flex-col p-0">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <Message key={i} msg={m} />
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-line p-3">
            {/* Topic selector — scope answers to one family, fewer wrong sources */}
            <div className="mb-2">
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <span>Topic</span>
                <span className="normal-case tracking-normal text-[10px] font-medium text-muted/90">
                  {activeTopic
                    ? `focused — answers stay in ${activeTopic.label}`
                    : "all documents — I also auto-detect (MVSG, RMU, CT/VT…)"}
                </span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                <TopicChip label="🌐 All" active={topic === "all"} onClick={() => pickTopic("all")} />
                {TOPICS.map((t) => (
                  <TopicChip
                    key={t.id}
                    label={`${t.emoji} ${SHORT[t.id] ?? t.label}`}
                    title={t.label}
                    active={topic === t.id}
                    onClick={() => pickTopic(t.id)}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                className="input flex-1"
                dir="auto"
                placeholder={
                  activeTopic
                    ? `Ask about ${activeTopic.label}… (English or العربية)`
                    : "Ask about the technical specs… (English or العربية)"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                disabled={!docs || busy}
              />
              <button className="btn-primary shrink-0" onClick={send} disabled={!docs || !input.trim() || busy}>
                Send
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">
              {activeTopic
                ? `Answering only from ${activeTopic.label} documents — pick “All” above to search everything.`
                : "The assistant reads the relevant specification pages and answers from them."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TopicChip({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold transition ${
        active
          ? "bg-brand text-white shadow-sm"
          : "bg-brand-tint/60 text-brand-dark hover:bg-brand-tint"
      }`}
    >
      {label}
    </button>
  );
}

function dedupeSources(hits: SearchHit[]): ChatSource[] {
  const seen = new Set<string>();
  const out: ChatSource[] = [];
  for (const h of hits) {
    const key = `${h.doc.id}#${h.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ doc: h.doc, page: h.page });
  }
  return out;
}

function Message({ msg }: { msg: ChatMsg }) {
  if (msg.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div dir="auto" className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-white shadow-soft">
          {msg.text}
        </div>
        {msg.topicTag && (
          <span className="mr-0.5 inline-flex items-center gap-1 rounded-full bg-brand-tint/70 px-2 py-0.5 text-[10px] font-semibold text-brand-dark">
            🎯 {msg.topicTag}
          </span>
        )}
      </div>
    );
  }

  if (msg.pending) {
    return (
      <div className="flex">
        <div className="rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3 shadow-sm">
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            Reading the documents…
          </span>
        </div>
      </div>
    );
  }

  const isAi = msg.role === "ai";
  const isNoMatch = msg.role === "noMatch";
  const isError = msg.role === "error";

  return (
    <div className="flex">
      <div className={`max-w-[85%] rounded-2xl rounded-bl-md border px-4 py-3 shadow-sm ${
        isError ? "border-red-200 bg-red-50" : isAi ? "border-violet-200 bg-violet-50/60" : "border-line bg-white"
      }`}>
        {/* Visual cue: which path produced this answer */}
        {!isError && (
          <div className={`mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            isAi ? "bg-violet-100 text-violet-700" : isNoMatch ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
          }`}>
            {isAi ? "✨ AI — from our documents" : isNoMatch ? "No match" : "📄 Closest document passage"}
          </div>
        )}
        <div dir="auto" className={`whitespace-pre-wrap text-sm leading-relaxed ${isError ? "text-red-700" : "text-ink"}`}>
          {msg.text}
        </div>
        {msg.note && <p className="mt-1.5 text-[11px] font-medium text-amber-700">{msg.note}</p>}

        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-line/70 pt-2">
            {msg.sources.map((s, i) => (
              <a
                key={i}
                href={`/${s.doc.file}#page=${s.page}`}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-[11px] font-semibold text-brand-dark hover:underline"
                dir="auto"
              >
                📎 {s.doc.name} — page {s.page}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
