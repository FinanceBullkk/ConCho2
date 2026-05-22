const { z } = require('zod');

const loginBody = z.object({
  empCode: z.string().trim().min(1, 'empCode is required').max(32),
  password: z.string().min(1, 'password is required').max(128),
});

module.exports = { loginBody };
