const User = require('../models/User');
const Class = require('../models/Class');

// ──────────────────────────────────────────────────────────
// Bulk Import Controller
// ──────────────────────────────────────────────────────────
// Accepts arrays of objects from a client (or migration script)
// and uses Mongoose bulkWrite with upsert to safely sync data.
//
// UPSERT LOGIC:
//   - If the key field (empCode / classCode) already exists
//     in the database → UPDATE the document's other fields.
//   - If it doesn't exist → INSERT a new document.
//
// This guarantees zero duplicate-key errors, even if the
// same import is run multiple times (idempotent).
//
// WHY bulkWrite INSTEAD OF insertMany?
//   insertMany fails entirely on the first duplicate.
//   bulkWrite with updateOne + upsert handles each document
//   independently — duplicates get updated, new ones get
//   created, all in a single DB roundtrip.
// ──────────────────────────────────────────────────────────

/**
 * POST /api/import/users
 * Bulk import/update users by empCode
 *
 * Body: {
 *   users: [
 *     { empCode: "000001", name: "Admin User", role: "Admin", department: "Mgmt", status: "Active", password: "pass123" },
 *     { empCode: "000002", name: "Teacher A",  role: "Teacher", department: "English" },
 *     ...
 *   ]
 * }
 *
 * Rules:
 *   - empCode is REQUIRED in every object (it's the upsert key)
 *   - password is only set on INSERT (never overwritten on update)
 *   - All other fields are updated if provided
 */
const bulkImportUsers = async (req, res) => {
  try {
    const { users } = req.body;

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must contain a non-empty "users" array',
      });
    }

    // Validate: every object must have empCode
    const missingEmpCode = users.filter(u => !u.empCode);
    if (missingEmpCode.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${missingEmpCode.length} record(s) are missing the required "empCode" field`,
      });
    }

    // Validate: name and role are required for new inserts.
    // Since we use upsert, we can't know ahead of time which records are
    // new vs existing. So we validate that EVERY record has them — if it's
    // an update, the values are just re-set (harmless). If it's an insert
    // without them, Mongoose would throw an opaque validation error.
    const missingFields = users.filter(u => !u.name || !u.role);
    if (missingFields.length > 0) {
      const examples = missingFields.slice(0, 3).map(u => u.empCode || '(no empCode)');
      return res.status(400).json({
        success: false,
        message: `${missingFields.length} record(s) are missing required "name" or "role" field. Examples: ${examples.join(', ')}`,
      });
    }

    // Hash passwords for new users (bcrypt)
    const bcrypt = require('bcryptjs');

    const operations = await Promise.all(
      users.map(async (u) => {
        // Normalize empCode to uppercase (matches schema setter)
        const empCode = u.empCode.trim().toUpperCase();

        // Build the $set payload (fields to update on match)
        const setFields = { empCode };
        if (u.name !== undefined)       setFields.name = u.name;
        if (u.role !== undefined)       setFields.role = u.role;
        if (u.department !== undefined) setFields.department = u.department;
        if (u.status !== undefined)     setFields.status = u.status;

        // Build the $setOnInsert payload (fields set ONLY on new docs)
        const setOnInsert = {};
        if (u.password) {
          const salt = await bcrypt.genSalt(12);
          setOnInsert.password = await bcrypt.hash(u.password, salt);
        } else {
          // Default password for new imports
          const salt = await bcrypt.genSalt(12);
          setOnInsert.password = await bcrypt.hash('default123', salt);
        }

        return {
          updateOne: {
            filter: { empCode },           // ← upsert key
            update: {
              $set: setFields,
              $setOnInsert: setOnInsert,    // ← only on INSERT
            },
            upsert: true,
          },
        };
      })
    );

    const result = await User.bulkWrite(operations);

    res.json({
      success: true,
      message: `Import complete: ${result.upsertedCount} created, ${result.modifiedCount} updated`,
      data: {
        total: users.length,
        created: result.upsertedCount,
        updated: result.modifiedCount,
        matched: result.matchedCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/import/classes
 * Bulk import/update classes by classCode
 *
 * Body: {
 *   classes: [
 *     { classCode: "EL001", courseName: "Business English B1", status: "Ongoing" },
 *     { classCode: "EL002", courseName: "General English A2" },
 *     ...
 *   ]
 * }
 *
 * Rules:
 *   - classCode is REQUIRED in every object (it's the upsert key)
 *   - status defaults to 'Ongoing' on insert if not provided
 */
const bulkImportClasses = async (req, res) => {
  try {
    const { classes } = req.body;

    if (!classes || !Array.isArray(classes) || classes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must contain a non-empty "classes" array',
      });
    }

    // Validate: every object must have classCode
    const invalid = classes.filter(c => !c.classCode);
    if (invalid.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${invalid.length} record(s) are missing the required "classCode" field`,
      });
    }

    const operations = classes.map((c) => {
      const classCode = c.classCode.trim().toUpperCase();

      const setFields = { classCode };
      if (c.courseName !== undefined) setFields.courseName = c.courseName;
      if (c.status !== undefined)     setFields.status = c.status;

      // Default status on insert only
      const setOnInsert = {};
      if (!c.status) setOnInsert.status = 'Ongoing';

      return {
        updateOne: {
          filter: { classCode },           // ← upsert key
          update: {
            $set: setFields,
            $setOnInsert: setOnInsert,
          },
          upsert: true,
        },
      };
    });

    const result = await Class.bulkWrite(operations);

    res.json({
      success: true,
      message: `Import complete: ${result.upsertedCount} created, ${result.modifiedCount} updated`,
      data: {
        total: classes.length,
        created: result.upsertedCount,
        updated: result.modifiedCount,
        matched: result.matchedCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { bulkImportUsers, bulkImportClasses };
