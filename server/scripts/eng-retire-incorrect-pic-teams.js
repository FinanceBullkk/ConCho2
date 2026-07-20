#!/usr/bin/env node
/* eslint-disable no-console */

// Retires the reversible generic rows produced by the superseded English
// active-handoff. No row is deleted: Programs/Classes/Teams are soft-deleted;
// linked Enrollments are closed and keep their source metadata.

require('dotenv').config();
const { getPool, closePool } = require('../config/pg');

const apply = process.argv.includes('--apply');

const preview = async (client) => {
  const { rows } = await client.query(`
    SELECT
      (SELECT count(*)::int FROM learning_programs
        WHERE is_deleted = false AND meta->>'englishArchiveCourseKey' IS NOT NULL) AS programs,
      (SELECT count(*)::int FROM classes
        WHERE is_deleted = false AND meta->>'englishArchiveRunKey' IS NOT NULL) AS classes,
      (SELECT count(*)::int FROM teams
        WHERE is_deleted = false AND meta->>'englishArchiveTeamKey' IS NOT NULL) AS teams,
      (SELECT count(*)::int FROM enrollments
        WHERE status = 'Active' AND meta->>'englishArchiveEnrollmentKey' IS NOT NULL) AS enrollments,
      (SELECT count(*)::int FROM learning_programs p
        WHERE p.is_deleted = false
          AND p.meta->>'englishArchiveCourseKey' IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM classes c
            WHERE c.program_id = p.id AND c.is_deleted = false
              AND c.meta->>'englishArchiveRunKey' IS NULL
          )) AS programs_with_other_classes
  `);
  return rows[0];
};

const retire = async (client, before) => {
  if (before.programs_with_other_classes > 0) {
    throw new Error('Refusing to retire an English handoff Program that owns non-handoff Classes');
  }
  const enrollments = await client.query(`
    UPDATE enrollments SET
      status = 'Transferred',
      left_at = coalesce(left_at, now()),
      note = concat_ws(' | ', nullif(note, ''),
        'Retired superseded PIC-Team handoff; canonical roster remains in eng_run_enrollments'),
      meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
        'retiredBy', 'eng-retire-incorrect-pic-teams',
        'retiredAt', now(),
        'canonicalAuthority', 'ConMeoGauGau@4107cd52ee905e87254e099da23cb58dcbdd82a9'
      ),
      updated_at = now()
    WHERE status = 'Active'
      AND meta->>'englishArchiveEnrollmentKey' IS NOT NULL
  `);
  const teams = await client.query(`
    UPDATE teams SET is_deleted = true, deleted_at = coalesce(deleted_at, now()), updated_at = now()
    WHERE is_deleted = false AND meta->>'englishArchiveTeamKey' IS NOT NULL
  `);
  const classes = await client.query(`
    UPDATE classes SET is_deleted = true, deleted_at = coalesce(deleted_at, now()), updated_at = now()
    WHERE is_deleted = false AND meta->>'englishArchiveRunKey' IS NOT NULL
  `);
  const programs = await client.query(`
    UPDATE learning_programs SET is_deleted = true, deleted_at = coalesce(deleted_at, now()), updated_at = now()
    WHERE is_deleted = false AND meta->>'englishArchiveCourseKey' IS NOT NULL
  `);
  const result = {
    enrollmentsRetired: enrollments.rowCount,
    teamsRetired: teams.rowCount,
    classesRetired: classes.rowCount,
    programsRetired: programs.rowCount,
  };
  await client.query(`
    INSERT INTO eng_audit_events(action, entity_type, entity_key, details)
    VALUES ('generic_pic_team_handoff.retire', 'english_domain', 'canonical-authority', $1)
  `, [JSON.stringify({ before, result })]);
  return result;
};

const main = async () => {
  const client = await getPool().connect();
  try {
    const before = await preview(client);
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', before }, null, 2));
      return;
    }
    await client.query('BEGIN');
    const result = await retire(client, before);
    const after = await preview(client);
    await client.query('COMMIT');
    console.log(JSON.stringify({ mode: 'applied', before, result, after }, null, 2));
  } catch (error) {
    if (apply) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await closePool();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
