import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  mfaSchema,
  createUserSchema,
  editUserSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validations';

const validUser = {
  empCode: 'E001',
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'Coordinator',
  status: 'Active',
  password: 'longenough10',
};

describe('loginSchema', () => {
  it('accepts a code + password', () => {
    expect(loginSchema.safeParse({ empCode: 'E1', password: 'x' }).success).toBe(true);
  });
  it('rejects an empty code', () => {
    expect(loginSchema.safeParse({ empCode: '', password: 'x' }).success).toBe(false);
  });
});

describe('mfaSchema', () => {
  it('accepts a 6+ char code', () => {
    expect(mfaSchema.safeParse({ mfaCode: '123456' }).success).toBe(true);
  });
  it('rejects a short code', () => {
    expect(mfaSchema.safeParse({ mfaCode: '123' }).success).toBe(false);
  });
});

describe('createUserSchema', () => {
  it('accepts a fully valid user', () => {
    expect(createUserSchema.safeParse(validUser).success).toBe(true);
  });
  it('requires a valid email', () => {
    expect(createUserSchema.safeParse({ ...validUser, email: 'nope' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...validUser, email: '' }).success).toBe(false);
  });
  it('enforces a 10-char minimum password', () => {
    expect(createUserSchema.safeParse({ ...validUser, password: 'short' }).success).toBe(false);
  });
  it('rejects an unknown role', () => {
    expect(createUserSchema.safeParse({ ...validUser, role: 'Root' }).success).toBe(false);
  });
  it('allows blank optional department/position', () => {
    expect(createUserSchema.safeParse({ ...validUser, department: '', position: '' }).success).toBe(true);
  });
});

describe('editUserSchema', () => {
  it('allows a blank password (keep current)', () => {
    expect(editUserSchema.safeParse({ ...validUser, password: '' }).success).toBe(true);
  });
  it('still rejects a too-short non-blank password', () => {
    expect(editUserSchema.safeParse({ ...validUser, password: 'short' }).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('accepts matching new + confirm', () => {
    const r = changePasswordSchema.safeParse({ current: 'old', next: 'newpassword10', confirm: 'newpassword10' });
    expect(r.success).toBe(true);
  });
  it('rejects when confirm does not match', () => {
    const r = changePasswordSchema.safeParse({ current: 'old', next: 'newpassword10', confirm: 'different10' });
    expect(r.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('requires an employee code', () => {
    expect(forgotPasswordSchema.safeParse({ empCode: 'E1' }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ empCode: '' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('rejects mismatched passwords', () => {
    const r = resetPasswordSchema.safeParse({ password: 'longenough10', confirm: 'other10chars' });
    expect(r.success).toBe(false);
  });
  it('accepts matching passwords', () => {
    const r = resetPasswordSchema.safeParse({ password: 'longenough10', confirm: 'longenough10' });
    expect(r.success).toBe(true);
  });
});
