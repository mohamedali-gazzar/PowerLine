import type { Request, Response } from "express";
import { z } from "zod";
import { fail } from "../lib/http";

// AI answering for the Docs & Support chat. The browser retrieves the most
// relevant document passages locally (client-side search over the extracted
// chunks) and sends ONLY those here — the AI never reads whole files, it
// understands the question and composes an answer from the retrieved excerpts
// (classic RAG). Proxied server-side so the API key never reaches the browser.
// Configure with the GEMINI_API_KEY env var. When the key is missing the
// endpoint returns 503 and the chat falls back to showing the raw best match.

// gemini-flash-latest = the current fast model alias (this key's quota lives
// on the -latest aliases; pinned model names 404/429 for AI-Studio keys).
const GEMINI_MODEL = "gemini-flash-latest";

const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  // Top locally-retrieved chunks so the AI stays grounded in OUR documents
  // instead of answering from general knowledge.
  context: z
    .array(
      z.object({
        doc: z.string().trim().max(200),
        page: z.number().int().positive().optional().nullable(),
        text: z.string().trim().max(4000),
      })
    )
    .max(10)
    .default([]),
  // Recent turns (user/assistant) so follow-up questions keep their meaning.
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().trim().max(1500),
      })
    )
    .max(8)
    .default([]),
});

const SYSTEM_RULES =
  "You are the technical-documents assistant for PowerLine (electrical switchgear, Egypt). " +
  "The excerpts below were retrieved from the company's EEHC specification library for this " +
  "question. Answer the question accurately USING THE EXCERPTS as your source of truth. " +
  "Synthesize across excerpts when needed; quote exact values (ratings, clauses, standards) " +
  "when present. If the excerpts don't contain the answer, say plainly that the documents " +
  "don't cover it and name which document would likely cover it — do NOT invent facts. " +
  "Answer in the same language as the question (English or Arabic). Be clear and concise; " +
  "cite the document name (and page) you used. Write PLAIN TEXT only — no markdown, no " +
  "asterisks; use simple numbered or dashed lists.";

export async function askAi(req: Request, res: Response) {
  try {
    const { question, context, history } = askSchema.parse(req.body);

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(503).json({
        error:
          "The AI assistant isn't configured yet (GEMINI_API_KEY is not set). " +
          "Local document search still works.",
      });
    }

    const contextBlock =
      context.length > 0
        ? context
            .map(
              (c, i) =>
                `[Excerpt ${i + 1} — ${c.doc}${c.page ? `, page ${c.page}` : ""}]\n${c.text}`
            )
            .join("\n\n")
        : "(no relevant excerpts were found in the document library)";

    const historyBlock =
      history.length > 0
        ? `\n\n=== RECENT CONVERSATION ===\n${history
            .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.text}`)
            .join("\n")}`
        : "";

    const prompt = `${SYSTEM_RULES}\n\n=== DOCUMENT EXCERPTS ===\n${contextBlock}${historyBlock}\n\n=== QUESTION ===\n${question}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    let resp: globalThis.Response;
    try {
      resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
          }),
          signal: ctrl.signal,
        }
      );
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error(`Gemini API ${resp.status}: ${detail.slice(0, 500)}`);
      return res
        .status(502)
        .json({ error: "The AI service returned an error — try again in a moment." });
    }

    const data = (await resp.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const answer =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!answer.trim()) {
      return res.status(502).json({ error: "The AI service returned an empty answer." });
    }
    res.json({ answer: answer.trim() });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      return res.status(504).json({ error: "The AI request timed out — try again." });
    }
    fail(res, e);
  }
}
