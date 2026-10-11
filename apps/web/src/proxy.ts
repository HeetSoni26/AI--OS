import { NextResponse, type NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

const protectedPrefixes = ["/dashboard", "/knowledge-graph", "/clients", "/agents", "/chatbots", "/workflows", "/content", "/services", "/finance", "/pipeline", "/knowledge-base", "/reports", "/settings"];

export async function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const isProtected = protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  const isDevelopmentBypass = process.env.AIOS_AUTH_BYPASS === "development-shell" && (process.env.NODE_ENV !== "production" || process.env.AIOS_DEMO_MODE === "true");
  const { response, user } = await refreshSupabaseSession(request, requestHeaders);
  response.headers.set("x-request-id", requestId);

  if (isProtected && isDevelopmentBypass) return response;

  if (isProtected && !user && !isDevelopmentBypass) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) loginUrl.searchParams.set("reason", "configuration");
    return NextResponse.redirect(loginUrl);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
