import type { Request, Response } from "express";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { fail } from "../lib/http";

// AI answering for the Docs & Support chat. The browser retrieves the most
// relevant document passages locally (client-side search over the extracted
// chunks) and sends ONLY those here — the AI never reads whole files, it
// understands the question and composes an answer from the retrieved excerpts
// (classic RAG). Proxied server-side so the API key never reaches the browser.
// Configure with the ANTHROPIC_API_KEY env var. When the key is missing the
// endpoint returns 503 and the chat falls back to showing the raw best match.

// Claude Opus 4.8 — Anthropic's most capable model, for accurate, well-grounded
// answers over the retrieved excerpts. To trade some quality for lower cost on a
// high-traffic chat, change this to "claude-sonnet-5" (near-Opus quality, ~⅓ the
// price) or "claude-haiku-4-5" (cheapest) — nothing else needs to change.
const CLAUDE_MODEL = "claude-opus-4-8";

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
  // Optional product topic the user scoped the chat to (e.g. "MV Switchgear
  // (MVSG)") so the AI stays on-subject and doesn't mix document families.
  topic: z.string().trim().max(120).optional(),
});

const SYSTEM_RULES =
  "You are the technical-documents assistant for PowerLine (electrical switchgear, Egypt) — a " +
  "knowledgeable, friendly colleague who helps engineers find answers in the EEHC specification " +
  "library. The excerpts provided with each question were retrieved from that library and are your " +
  "source of truth. Answer accurately USING THE EXCERPTS: synthesize across them when needed and " +
  "quote exact values (ratings, clauses, standards, KV/A figures) when present. If the excerpts " +
  "don't contain the answer, say so plainly and name which document would likely cover it — never " +
  "invent facts. If the question is too vague to answer, or clearly needs a specific product or " +
  "rating the user hasn't given, ask ONE short clarifying question and suggest the likely options — " +
  "otherwise answer directly, don't stall. When a topic scope is given, stay within it. Answer in " +
  "the SAME LANGUAGE as the question (English or Arabic). Cite the document name (and page) you " +
  "relied on. Write PLAIN TEXT only — no markdown, no asterisks; use simple numbered or dashed " +
  'lists. Reply with only the answer itself: no preamble such as "Based on the excerpts…" and no ' +
  "notes about your own reasoning.";

// One shared client per process; reads the key passed from the env at first use.
// maxRetries defaults to 2 (429 / 5xx / connection errors are retried for us).
let anthropic: Anthropic | null = null;
function client(apiKey: string): Anthropic {
  if (!anthropic) anthropic = new Anthropic({ apiKey, timeout: 30_000 });
  return anthropic;
}

export async function askAi(req: Request, res: Response) {
  try {
    const { question, context, history, topic } = askSchema.parse(req.body);

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return res.status(503).json({
        error:
          "The AI assistant isn't configured yet (ANTHROPIC_API_KEY is not set). " +
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

    const topicLine = topic
      ? `\n\n=== TOPIC SCOPE ===\nThe user has scoped this chat to: "${topic}". Keep the answer within this topic.`
      : "";

    const userMessage = `=== DOCUMENT EXCERPTS ===\n${contextBlock}${historyBlock}${topicLine}\n\n=== QUESTION ===\n${question}`;

    let message: Anthropic.Message;
    try {
      message = await client(key).messages.create({
        model: CLAUDE_MODEL,
        // Generous headroom so answers are never cut off mid-sentence (the old
        // 1024-token cap on Gemini truncated them). Answers here are short, so
        // this is plenty and non-streaming stays well under the request timeout.
        max_tokens: 2048,
        system: SYSTEM_RULES,
        messages: [{ role: "user", content: userMessage }],
      });
    } catch (err) {
      if (err instanceof Anthropic.APIConnectionTimeoutError) {
        return res.status(504).json({ error: "The AI request timed out — try again." });
      }
      if (err instanceof Anthropic.APIError) {
        console.error(`Anthropic API ${err.status ?? ""}: ${String(err.message).slice(0, 500)}`);
        if (err.status === 401 || err.status === 403) {
          return res
            .status(503)
            .json({ error: "The AI assistant isn't configured correctly — check the API key." });
        }
        if (err.status === 429) {
          return res
            .status(502)
            .json({ error: "The AI is busy right now — try again in a moment." });
        }
        return res
          .status(502)
          .json({ error: "The AI service returned an error — try again in a moment." });
      }
      throw err;
    }

    const answer = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!answer) {
      return res.status(502).json({ error: "The AI service returned an empty answer." });
    }
    res.json({ answer });
  } catch (e) {
    fail(res, e);
  }
}
