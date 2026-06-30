import { z } from "zod";

export const profileSchema = z.object({
  name: z.string().trim().max(120).optional(),
  // Must be a base64 raster image data URL (the client downscales first). SVG is
  // excluded on purpose (it can carry script); null clears the photo.
  photo: z
    .string()
    .regex(/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/, "Photo must be an image.")
    .max(3_000_000, "Image too large.")
    .nullable()
    .optional(),
});
