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
