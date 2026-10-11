# ADR-001: Platform baseline and repository location

- **Status:** Accepted
- **Date:** 2026-07-31
- **SRS scope:** Sections 2.4, 3.1-3.2, 11; SEC-A; NFR-M

## Context

The available `C:\Users\Heet\ZCodeProject` codebase is an unrelated Sahara P2P mock frontend built with Vite. Reusing it would require replacing its framework, domain, authentication, design system, data model, and routing. The approved AI OS roadmap and source SRS are stored under `C:\Users\Heet\OneDrive\Desktop\AI OS`.

## Decision

The AI Automation Agency OS uses this directory as its canonical Git repository and an npm workspace. The web application lives in `apps/web`; shared contracts and observability helpers live in `packages`. The initial runtime is the current stable Next.js App Router release satisfying Next.js 14+, React 18+, strict TypeScript, Tailwind CSS, Supabase Auth, and the integrations named by the SRS.

The architecture is a modular monolith. Domain rules must not depend directly on provider SDKs or UI code. External services will be introduced through typed adapters. Part 1 creates only shared foundations and honest not-yet-implemented module states.

As of the Part 1 validation date, stable Next.js 16.2.12 declares PostCSS 8.4.31 and Sharp 0.34.5, both covered by current high-severity advisories. The repository therefore pins Next.js 16.3.0-canary.104, whose official manifest declares patched PostCSS 8.5.23 and Sharp 0.35.3. This prerelease is accepted temporarily to avoid an invalid npm override tree or known vulnerable runtime. Upgrade to the first stable Next.js release containing those patched dependency ranges after rerunning the complete Part 1 suite.

## Consequences

- The unrelated Sahara P2P project remains unchanged.
- Exact installed package versions and the root lockfile define reproducible builds.
- Next.js 16 uses the `proxy.ts` convention instead of deprecated `middleware.ts`.
- Authentication is implemented with Supabase SSR clients and rechecked in protected layouts/actions; Proxy is only an optimistic refresh/redirect layer.
- Production login throttling requires Upstash Redis REST credentials. Development/tests may use a deterministic in-process limiter, but production never silently falls back to it.
- OneDrive may introduce filesystem latency. If it disrupts builds, the repository can be moved without changing its internal structure.
