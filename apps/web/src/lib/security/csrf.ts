import { getServerEnv } from "@/lib/config/env";

export function isTrustedMutationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  const allowed = new Set(getServerEnv().AIOS_CORS_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean));
  allowed.add(getServerEnv().NEXT_PUBLIC_APP_URL);
  return allowed.has(origin);
}
