// 030 — users security columns (Phase 3 Wave-E slice E3: auth port).
//
// The users table (001 + 004/018/019/025) so far carried only directory
// fields; every security field lived in Mongo only. This extracts the auth
// surface to real columns — the exact field set of models/User.js that the
// login path, auth middleware and the E4 mutation ports read/write:
//
//   password / password_changed_at / must_change_password
//   password_reset_token / password_reset_expires
//   mfa_enabled / mfa_secret / mfa_pending_secret / mfa_pending_secret_expires
//   mfa_backup_codes (bcrypt hashes, single-use) / mfa_last_used_counter
//   failed_login_attempts / lock_until
//
// Fidelity notes:
//   • select:false in Mongo (password, mfa*, failedLoginAttempts, lockUntil)
//     has no column-level analogue — the repository impls enforce it by
//     never selecting these columns outside the explicit security readers
//     (services/auth/auth-repository.pg.js).
//   • No index on password_reset_token on purpose — Mongo has none either
//     (~1000 users; the reset lookup is rare and a scan is fine).
//   • NOT NULL + defaults mirror the Mongoose schema defaults so rows
//     created by earlier ports read back with login-safe values.
//   • No security columns existed before this migration — nothing to backfill
//     here; the Mongo→PG ETL (Phase 5) carries the real values.

exports.up = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.text('password');
    t.timestamp('password_changed_at', { useTz: true });
    t.boolean('must_change_password').notNullable().defaultTo(false);
    t.text('password_reset_token');
    t.timestamp('password_reset_expires', { useTz: true });

    t.boolean('mfa_enabled').notNullable().defaultTo(false);
    t.text('mfa_secret');
    t.text('mfa_pending_secret');
    t.timestamp('mfa_pending_secret_expires', { useTz: true });
    t.specificType('mfa_backup_codes', 'text[]');
    t.bigInteger('mfa_last_used_counter');

    t.integer('failed_login_attempts').notNullable().defaultTo(0);
    t.timestamp('lock_until', { useTz: true });
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumns(
      'password', 'password_changed_at', 'must_change_password',
      'password_reset_token', 'password_reset_expires',
      'mfa_enabled', 'mfa_secret', 'mfa_pending_secret',
      'mfa_pending_secret_expires', 'mfa_backup_codes', 'mfa_last_used_counter',
      'failed_login_attempts', 'lock_until',
    );
  });
};
