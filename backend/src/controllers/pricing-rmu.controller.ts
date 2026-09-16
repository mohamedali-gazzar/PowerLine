// RMU price database — the factor endpoint for the /pricing "RMU" tab.
//
// Managed through the Excel round-trip (pricing-rmu-import.controller.ts). Each RmuPrice row stores
// a COST (costUsd); the SELLING price the engine reads is priceUsd = round(cost / factor), where the
// factor is one scalar (PriceSetting scope "RMU" key "factor", default 0.85). Changing the factor
// re-derives priceUsd for every active row from its cost, then publishes.

import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";
import { getRmuFactor, sellRmu } from "../domain/rmuFactor";
import { publishCurrentPricesDetailed } from "./pricing.controller";

const factorSchema = z.object({ factor: z.number().positive().max(10) });

/** POST /api/pricing/rmu/factor — set the RMU selling factor (selling = cost / factor). */
export async function postRmuFactor(req: Request, res: Response) {
  try {
    const parsed = factorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Factor must be a positive number." });
    const factor = parsed.data.factor;
    const prev = await getRmuFactor();
    const actorEmail = req.userEmail ?? "";

    await prisma.priceSetting.upsert({
      where: { scope_key: { scope: "RMU", key: "factor" } },
      update: { num: factor, updatedBy: actorEmail },
      create: { scope: "RMU", key: "factor", num: factor, updatedBy: actorEmail },
    });
    if (prev !== factor) {
      await prisma.priceChange.create({
        data: {
          domain: "RMU", entity: "PriceSetting", entityId: "RMU.factor",
          label: "RMU selling factor", field: "factor",
          oldValue: String(prev), newValue: String(factor),
          actorId: req.userId ?? null, actorEmail,
        },
      });
    }

    // Re-derive the selling price (priceUsd) for every active row from its stored cost.
    const rows = await prisma.rmuPrice.findMany({ where: { active: true }, select: { id: true, costUsd: true, priceUsd: true } });
    let repriced = 0;
    for (const r of rows) {
      const sell = sellRmu(r.costUsd, factor);
      if (sell !== r.priceUsd) {
        await prisma.rmuPrice.update({ where: { id: r.id }, data: { priceUsd: sell, updatedBy: actorEmail } });
        repriced++;
      }
    }

    // Every price change goes live as it is made (same model as LV/Transformer).
    const { version } = await publishCurrentPricesDetailed(actorEmail, "RMU factor");
    res.json({ ok: true, factor, repriced, published: version != null, version });
  } catch (e) {
    fail(res, e);
  }
}
