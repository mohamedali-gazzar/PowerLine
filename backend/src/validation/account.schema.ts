import { z } from "zod";

export const profileSchema = z.object({
  name: z.string().trim().max(120).optional(),
  // base64 data URL (the client downscales the image first); null clears it.
  photo: z
    .string()
    .max(3_000_000, "Image too large.")
    .nullable()
    .optional(),
});
