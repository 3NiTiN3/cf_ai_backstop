import { z } from "zod";

export const NamespaceSchema = z.enum(["live", "demo"]);

export const NamespaceQuery = z.object({
  namespace: NamespaceSchema.default("demo"),
});
