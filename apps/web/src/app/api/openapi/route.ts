import { openApiDocument } from "@/lib/api/openapi";

export const dynamic = "force-static";

export function GET() {
  return Response.json(openApiDocument, {
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
