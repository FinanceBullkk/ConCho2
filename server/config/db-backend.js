// DB backend selector (PG-migration Phase 2 foundation).
// `DB_BACKEND` decides which repository implementation the (dual-ported) repos
// resolve to. Default 'mongo' → the running app is 100% unchanged until a repo
// is ported and the flag is flipped (Phase 3). No dual-write: the code switches,
// the data cuts over once (Phase 5).
const DB_BACKEND = (process.env.DB_BACKEND || 'mongo').toLowerCase();
const isPostgres = DB_BACKEND === 'postgres';
const isMongo = !isPostgres;

module.exports = { DB_BACKEND, isPostgres, isMongo };
