// DB backend selector (PG-migration Phase 2 foundation).
// Default 'postgres' since Wave K decommissioned Mongo (D2e-2b: mongoose + the
// 32 models deleted). The flag now only distinguishes the live PG backend from
// a legacy 'mongo' value that no longer resolves to anything runnable — kept as
// a selector shape so the isPostgres/isMongo consumers don't need touching.
const DB_BACKEND = (process.env.DB_BACKEND || 'postgres').toLowerCase();
const isPostgres = DB_BACKEND === 'postgres';
const isMongo = !isPostgres;

module.exports = { DB_BACKEND, isPostgres, isMongo };
