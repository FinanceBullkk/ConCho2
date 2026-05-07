import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  createUserSchema,
  editUserSchema,
  changePasswordSchema,
} from '../index';

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({ empCode: '000001', password: 'secret' });
    expect(result.success).toBe(true);
  });

  it('rejects empty empCode', () => {
    const result = loginSchema.safeParse({ empCode: '', password: 'secret' });
    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.empCode).toBeDefined();
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ empCode: '000001', password: '' });
    expect(result.success).toBe(false);
  });
});

describe('createUserSchema', () => {
  const valid = {
    empCode: '000001',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'Participant',
    status: 'Active',
    password: 'password123',
  };

  it('accepts valid user data', () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = createUserSchema.safeParse({ ...valid, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = createUserSchema.safeParse({ ...valid, password: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = createUserSchema.safeParse({ ...valid, role: 'SuperAdmin' });
    expect(result.success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('rejects when passwords do not match', () => {
    const result = changePasswordSchema.safeParse({
      current: 'currentPass1',
      next: 'newPassword123',
      confirm: 'differentPassword',
    });
    expect(result.success).toBe(false);
    const errors = result.error.flatten().fieldErrors;
    expect(errors.confirm).toBeDefined();
  });

  it('rejects new password shorter than 10 chars', () => {
    const result = changePasswordSchema.safeParse({
      current: 'currentPass1',
      next: 'short',
      confirm: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('accepts matching valid passwords', () => {
    const result = changePasswordSchema.safeParse({
      current: 'currentPass1',
      next: 'newValidPass123',
      confirm: 'newValidPass123',
    });
    expect(result.success).toBe(true);
  });
});
