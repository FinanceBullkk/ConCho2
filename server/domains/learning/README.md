# Learning Domain

This module is the first modular-monolith boundary for the L&D platform.

Current physical compatibility:

- `LearningProgram` is the new catalog model.
- Legacy `Class` documents are exposed as cohorts through `programId`.
- Legacy routes under `/api/classes` stay compatible while new clients can use `/api/learning/*`.

Directory convention for new domain modules:

```txt
domains/<domain>/
├── routes.js
├── controller.js
├── use-cases.js
├── repository.js
├── policy.js
└── schemas.js
```

Keep controllers thin. Put business rules in use-cases. Keep Mongoose-specific calls behind repositories when a module is being extracted.
