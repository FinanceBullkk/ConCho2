# Context Map

TMS v2 / Internal LTMS is one product split across two contexts. This map points to each context's glossary. ADRs (system-wide decisions) live in `docs/decisions/`.

## Contexts

- [Server](./server/CONTEXT.md) — the training-operations domain: programs, cohorts, groups, sessions, booking, attendance, assessment, reporting.
- Client (`client/`) — the UI/presentation context. No `CONTEXT.md` yet; created lazily when the first client-specific term is resolved.

## Relationships

- **Client → Server**: the SPA consumes the server's REST API. User-facing vocabulary follows the platform terms (Cohort, Program, Session, LearningGroup), not the legacy Mongo model names (`Class`, `Schedule`, `Team`).
