const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Class = require('../models/Class');

// ──────────────────────────────────────────────────────────
// Import Service
// ──────────────────────────────────────────────────────────

const { ServiceError } = require('../helpers/ServiceError');

const MAX_IMPORT_BATCH = 2000;
const CHUNK_SIZE = 50;

/**
 * Generate a cryptographically secure random password (DI-09).
 * Replaces the old hardcoded 'default123' to prevent mass-credential-guessing.
 */
const generateSecurePassword = () => crypto.randomBytes(12).toString('base64url');

/**
 * Bulk import/update users by empCode (atomic, chunked bcrypt).
 *
 * @param {Array} users  Array of user objects with empCode, name, role, etc.
 * @returns {Object} { total, created, updated, matched }
 */
const importUsers = async (users) => {
  // ── Validation ──────────────────────────────────────────
  if (!users || !Array.isArray(users) || users.length === 0) {
    throw new ServiceError('Request body must contain a non-empty "users" array');
  }
  if (users.length > MAX_IMPORT_BATCH) {
    throw new ServiceError(
      `Too many records. Maximum ${MAX_IMPORT_BATCH} users per request. Split into smaller batches.`
    );
  }

  const missingEmpCode = users.filter(u => !u.empCode);
  if (missingEmpCode.length > 0) {
    throw new ServiceError(
      `${missingEmpCode.length} record(s) are missing the required "empCode" field`
    );
  }

  const missingFields = users.filter(u => !u.name || !u.role);
  if (missingFields.length > 0) {
    const examples = missingFields.slice(0, 3).map(u => u.empCode || '(no empCode)');
    throw new ServiceError(
      `${missingFields.length} record(s) are missing required "name" or "role" field. Examples: ${examples.join(', ')}`
    );
  }

  // ── Pre-load existing empCodes to skip bcrypt for updates ─
  const allEmpCodes = users.map(u => u.empCode.trim().toUpperCase());
  const existingUsers = await User.find(
    { empCode: { $in: allEmpCodes } },
    { empCode: 1 }
  ).lean();
  const existingSet = new Set(existingUsers.map(u => u.empCode));

  // ── Chunked bcrypt hashing (only for NEW users) ─────────
  const operations = [];
  for (let i = 0; i < users.length; i += CHUNK_SIZE) {
    const chunk = users.slice(i, i + CHUNK_SIZE);
    const chunkOps = await Promise.all(
      chunk.map(async (u) => {
        const empCode = u.empCode.trim().toUpperCase();
        const setFields = { empCode };
        if (u.name !== undefined) setFields.name = u.name;
        if (u.email !== undefined && u.email !== null && u.email !== '') {
          setFields.email = String(u.email).trim().toLowerCase();
        }
        if (u.role !== undefined) setFields.role = u.role;
        if (u.department !== undefined) setFields.department = u.department;
        if (u.status !== undefined) setFields.status = u.status;

        // Only hash password for NEW users (skip bcrypt for existing)
        const setOnInsert = {};
        if (!existingSet.has(empCode)) {
          const raw = u.password || generateSecurePassword();
          const salt = await bcrypt.genSalt(12);
          setOnInsert.password = await bcrypt.hash(raw, salt);
        }

        return {
          updateOne: {
            filter: { empCode },
            update: { $set: setFields, ...(Object.keys(setOnInsert).length > 0 ? { $setOnInsert: setOnInsert } : {}) },
            upsert: true,
          },
        };
      })
    );
    operations.push(...chunkOps);
  }

  // ── Atomic execution ────────────────────────────────────
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await User.bulkWrite(operations, { session });
    });
  } finally {
    session.endSession();
  }

  return {
    total: users.length,
    created: result.upsertedCount,
    updated: result.modifiedCount,
    matched: result.matchedCount,
  };
};

/**
 * Bulk import/update classes by classCode (atomic).
 *
 * @param {Array} classes  Array of class objects with classCode, courseName, etc.
 * @returns {Object} { total, created, updated, matched }
 */
const importClasses = async (classes) => {
  if (!classes || !Array.isArray(classes) || classes.length === 0) {
    throw new ServiceError('Request body must contain a non-empty "classes" array');
  }
  if (classes.length > MAX_IMPORT_BATCH) {
    throw new ServiceError(
      `Too many records. Maximum ${MAX_IMPORT_BATCH} classes per request.`
    );
  }

  const invalid = classes.filter(c => !c.classCode);
  if (invalid.length > 0) {
    throw new ServiceError(
      `${invalid.length} record(s) are missing the required "classCode" field`
    );
  }

  const operations = classes.map((c) => {
    const classCode = c.classCode.trim().toUpperCase();
    const setFields = { classCode };
    if (c.courseName !== undefined) setFields.courseName = c.courseName;
    if (c.status !== undefined) setFields.status = c.status;

    const setOnInsert = {};
    if (!c.status) setOnInsert.status = 'Ongoing';

    return {
      updateOne: {
        filter: { classCode },
        update: { $set: setFields, $setOnInsert: setOnInsert },
        upsert: true,
      },
    };
  });

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await Class.bulkWrite(operations, { session });
    });
  } finally {
    session.endSession();
  }

  return {
    total: classes.length,
    created: result.upsertedCount,
    updated: result.modifiedCount,
    matched: result.matchedCount,
  };
};

module.exports = { ServiceError, importUsers, importClasses };
