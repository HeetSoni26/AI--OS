import { z } from "zod";

export * from "./api";
export * from "./client-events";
export * from "./clients";
export * from "./graph";
export * from "./agents";
export * from "./chatbots";
export * from "./workflows";
export * from "./content";
export * from "./pipeline";
export * from "./finance";
export * from "./knowledge";

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string().min(1),
  timestamp: z.string().datetime(),
  version: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const ownerNavigationSchema = z.object({
  label: z.string().min(1),
  href: z.string().startsWith("/"),
  description: z.string().min(1),
  icon: z.string().min(1),
});

export type OwnerNavigationItem = z.infer<typeof ownerNavigationSchema>;
