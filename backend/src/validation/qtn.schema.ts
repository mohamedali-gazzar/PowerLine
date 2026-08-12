import { z } from "zod";

const number = z.string().trim().min(1, "Quotation number is required.").max(120);

// Client-computed summary stored alongside the JSON state so listing/stats need
// no pricing logic on the server.
const summary = z
  .object({
    projectName: z.string().max(300).optional(),
    customer: z.string().max(300).optional(),
    panelsCount: z.number().int().min(0).optional(),
    totalEgp: z.number().min(0).optional(),
  })
  .optional();

// `state` is the whole LvState object — validated structurally on the client.
export const createQtnSchema = z.object({ number, state: z.unknown(), summary });
export const updateQtnSchema = z.object({ state: z.unknown(), summary });
export const numberSchema = z.object({ number });

// Hand a quotation over to another user (transfer ownership).
export const reassignSchema = z.object({
  toUserId: z.string().trim().min(1, "Pick a user to hand it to."),
  note: z.string().max(2000).optional(),
});

// Co-Work: replace the set of people sharing a quotation with its owner. An empty
// list ends co-work. `coOwnerId` is the old single-slot field, still accepted so a
// client running a cached bundle mid-rollout keeps working.
export const coworkSchema = z.object({
  coOwnerIds: z.array(z.string().trim()).max(20).optional(),
  coOwnerId: z.string().trim().nullable().optional(),
  note: z.string().max(2000).optional(),
});

// ── Specs-tab attachments ───────────────────────────────────────────────────
// Files travel as base64 inside the JSON body. The cap is set by the PRODUCTION
// host, not by us: Vercel rejects a serverless request body over 4.5 MB, and
// base64 inflates bytes by 4/3 — so 3 MB of file is the largest that survives
// (3 MB × 4/3 = 4 MB, leaving headroom for the JSON envelope).
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_QTN = 30;

export const attachmentSchema = z.object({
  name: z.string().trim().min(1, "File name is required.").max(260),
  mime: z.string().trim().max(160).optional(),
  // Plain base64 — the client strips any "data:*;base64," prefix before sending.
  data: z.string().min(1, "File is empty."),
});
