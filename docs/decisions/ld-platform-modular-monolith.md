# ADR: L&D Platform Modular Monolith

## Status

Accepted.

## Context

TMS v2 started as an English training booking system. L&D needs to add more training activities: onboarding, compliance, soft skills, technical training, workshops, and internal courses.

The existing app already has strong production basics: Express, Mongoose, React/Vite, auth hardening, audit log, reconciliation, exports, and tests. A rewrite would create high delivery risk without immediate user value.

## Decision

Evolve TMS into an L&D platform as a modular monolith.

Backend modules follow:

```txt
server/domains/<domain>/
├── routes.js
├── controller.js
├── use-cases.js
├── repository.js
├── schemas.js
└── dto.js
```

> **Note on `policy.js`:** The ADR template lists `policy.js` inside the domain module, but in practice cross-cutting policies (attendance, auth, class, evaluation, classBinding) live in `server/policy/` as shared modules. This is intentional — domain-specific policies that are only consumed by a single domain can move into the domain module later; shared policies stay centralized.

Frontend modules should move toward:

```txt
client/src/features/<domain>/
├── pages/
├── components/
├── hooks/
└── api/
```

Current first boundary is `server/domains/learning`.

## Consequences

- Keep Express and React/Vite.
- Keep existing routes compatible.
- Add new platform APIs under `/api/learning/*`.
- Do not split into microservices in this phase.
- Do not rename physical Mongo collections during the first 6-month roadmap.

## Alternatives Considered

| Option | Reason rejected |
|---|---|
| Big-bang rewrite | Too much risk; existing app has valuable hardening and behavior. |
| Microservices | Operational complexity not justified for current scale. |
| Keep feature-by-feature layout only | Does not create stable boundaries for new L&D domains. |

## Unresolved Questions

- Exact first non-English training workflow to model after the foundation lands.
