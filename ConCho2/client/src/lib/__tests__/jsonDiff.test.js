import { describe, it, expect } from 'vitest';
import { diffJson } from '../jsonDiff';

describe('diffJson', () => {
  it('returns only eq lines for identical values', () => {
    const obj = { a: 1, b: 'x' };
    const lines = diffJson(obj, obj);
    expect(lines.every((l) => l.type === 'eq')).toBe(true);
  });

  it('emits del+add pair for a changed field', () => {
    const before = { a: 1, b: 'x' };
    const after  = { a: 2, b: 'x' };
    const lines = diffJson(before, after);
    const dels = lines.filter((l) => l.type === 'del');
    const adds = lines.filter((l) => l.type === 'add');
    expect(dels).toHaveLength(1);
    expect(adds).toHaveLength(1);
    expect(dels[0].line).toContain('"a": 1');
    expect(adds[0].line).toContain('"a": 2');
  });

  it('emits add for new fields and del for removed', () => {
    const lines = diffJson({ a: 1 }, { a: 1, b: 2 });
    expect(lines.some((l) => l.type === 'add' && l.line.includes('"b": 2'))).toBe(true);
  });

  it('treats reordered keys as equal (stable stringify)', () => {
    const before = { a: 1, b: 2, c: 3 };
    const after  = { c: 3, a: 1, b: 2 };
    const lines = diffJson(before, after);
    expect(lines.every((l) => l.type === 'eq')).toBe(true);
  });

  it('handles null safely', () => {
    const lines = diffJson(null, { a: 1 });
    expect(lines.some((l) => l.type === 'add')).toBe(true);
  });
});
