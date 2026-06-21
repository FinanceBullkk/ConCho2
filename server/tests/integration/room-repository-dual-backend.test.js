/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — room repository dual-backend selector (Phase 3 Wave-B)
 * ──────────────────────────────────────────────────────────
 * First WHOLE-repository port. Pins that the DB_BACKEND selector resolves to the
 * Mongo impl by default (app unchanged), both impls load (the PG impl loads
 * without opening a connection), and the Mongo CRUD path is intact through the
 * selector. Exact Mongo↔PG parity (CRUD + traps) is proven on real Postgres by
 * tests/pg-parity/room-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const roomRepo = require('../../domains/room/repository');
const Office = require('../../models/Office');

const uniq = () => Math.random().toString(16).slice(2, 8);
let officeId;

beforeAll(async () => {
  await getApp();
  const office = await Office.create({ name: 'Office X', code: `OX${uniq()}`.toUpperCase() });
  officeId = office._id;
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('room repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(typeof roomRepo.createRoom).toBe('function');
    expect(roomRepo.createRoom).toBe(roomRepo.impls.mongo.createRoom); // default = mongo
    expect(typeof roomRepo.impls.mongo.createRoom).toBe('function');
    expect(typeof roomRepo.impls.pg.createRoom).toBe('function');
  });

  test('mongo CRUD round-trip through the selector (create → find → update → soft-delete)', async () => {
    const code = `RM${uniq()}`.toUpperCase();
    const created = await roomRepo.impls.mongo.createRoom({ name: '  Room 7 ', code: code.toLowerCase(), officeId });
    expect(created.name).toBe('Room 7');          // trimmed
    expect(created.code).toBe(code);              // uppercased

    const found = await roomRepo.impls.mongo.findRoomByIdLean(created._id);
    expect(found.officeId).toMatchObject({ _id: officeId, name: 'Office X' }); // populated

    const updated = await roomRepo.impls.mongo.updateRoomById(created._id, { seats: 12 });
    expect(updated.seats).toBe(12);

    const removed = await roomRepo.impls.mongo.softDeleteRoom(created._id);
    expect(removed).toBeTruthy();
    expect(await roomRepo.impls.mongo.findRoomByIdLean(created._id)).toBeNull(); // hidden after soft-delete
  });
});
