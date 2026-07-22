'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findOffenders, objectPath } = require('./check-sensitive-data');

test('allows application code and generated fixture scripts', () => {
  assert.deepEqual(findOffenders([
    'server/domains/english-training/import/read-workbook.js',
    'server/tests/unit/english-training-import.test.js',
  ]), []);
});

test('blocks Data directories and Excel files at any depth', () => {
  assert.deepEqual(findOffenders([
    'Data/employees.json',
    'archive\\Data\\attendance.csv',
    'fixtures/source.xlsx',
    'fixtures/source.xlsm',
  ]), [
    'Data/employees.json',
    'archive/Data/attendance.csv',
    'fixtures/source.xlsm',
    'fixtures/source.xlsx',
  ]);
});

test('extracts a path from rev-list object output', () => {
  assert.equal(objectPath('abc123 nested/path.xlsx'), 'nested/path.xlsx');
  assert.equal(objectPath('abc123'), '');
});
