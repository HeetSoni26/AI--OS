import routeManifest from "./registry.json";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
export type ApiRouteRegistration = { filesystem: string; path: string; methods: ApiMethod[] };

export const implementedApiRouteManifest = routeManifest as ApiRouteRegistration[];
export const implementedApiRoutes = implementedApiRouteManifest.map((route) => route.path);
export type ImplementedApiRoute = (typeof implementedApiRouteManifest)[number];
