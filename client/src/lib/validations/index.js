import { z } from 'zod';

// ──────────────────────────────────────────────────────────
// Shared Zod validation schemas
// Used by react-hook-form resolvers across all forms
// ──────────────────────────────────────────────────────────

export const loginSchema = z.object({
  empCode: z.string().min(1, 'Employee code is required').max(20),
  password: z.string().min(1, 'Password is required'),
});

export const mfaSchema = z.object({
  mfaCode: z
    .string()
    .min(6, 'Code must be at least 6 characters')
    .max(20, 'Code too long'),
});

export const createUserSchema = z.object({
  empCode: z
    .string()
    .min(1, 'Employee code is required')
    .max(20, 'Max 20 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  // P3-04: email is required on create (server requires it for Calendar invites).
  // Was optional/empty-string-allowed — now must be a valid email address.
  email: z.string().email('Must be a valid email address').max(254),
  role: z.enum(['Admin', 'Coordinator', 'Participant']),
  department: z.string().max(100).optional().or(z.literal('')),
  position: z.string().max(100).optional().or(z.literal('')),
  status: z.enum(['Active', 'Inactive', 'Dropped', 'Transferred', 'On-hold', 'Waiting for class']),
  // P3-04: password min aligned with server (min 10, was 8).
  password: z.string().min(10, 'Password must be at least 10 characters'),
  dropReason: z.string().max(500).optional().or(z.literal('')),
});

export const editUserSchema = createUserSchema
  .omit({ password: true })
  .extend({
    // P3-04: min aligned with server (10). Optional on edit — blank = keep current.
    password: z
      .string()
      .min(10, 'Password must be at least 10 characters')
      .optional()
      .or(z.literal('')),
    currentPassword: z
      .string()
      .max(128)
      .optional()
      .or(z.literal('')),
  });

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Current password is required'),
    next: z.string().min(10, 'New password must be at least 10 characters'),
    confirm: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.next === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

export const forgotPasswordSchema = z.object({
  empCode: z.string().min(1, 'Employee code is required').max(20),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(10, 'Password must be at least 10 characters'),
    confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
