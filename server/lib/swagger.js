/**
 * swagger.js — OpenAPI 3.0 spec configuration
 *
 * Serves Swagger UI at /api/docs (only in non-production or when
 * SWAGGER_ENABLED=true). The spec is also available as raw JSON
 * at GET /api/docs.json for tooling (Postman import, code gen, etc.).
 */
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'TMS v2 API',
      version: '2.0.0',
      description: `
Training Management System REST API.

**Authentication:** Most endpoints require a session cookie obtained via \`POST /auth/login\`.
The cookie is HttpOnly — pass \`credentials: 'include'\` in fetch or use \`withCredentials: true\` in Axios.

**Admin-only endpoints** require the authenticated user to have \`role: "Admin"\`.

**Cron endpoints** (\`/cron/*\`) require an \`Authorization: Bearer <CRON_TOKEN>\` header instead of a session cookie.
      `.trim(),
      contact: { name: 'TMS Admin' },
    },
    servers: [
      { url: '/api', description: 'Current server' },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'Session cookie set by POST /auth/login',
        },
        cronToken: {
          type: 'http',
          scheme: 'bearer',
          description: 'CRON_TOKEN shared secret for cron endpoints',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation error' },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            total:      { type: 'integer', example: 42 },
            page:       { type: 'integer', example: 1 },
            totalPages: { type: 'integer', example: 5 },
            limit:      { type: 'integer', example: 20 },
          },
        },
        User: {
          type: 'object',
          properties: {
            _id:        { type: 'string', example: '64a1b2c3d4e5f6789012abcd' },
            empCode:    { type: 'string', example: '000001' },
            name:       { type: 'string', example: 'Alice Admin' },
            email:      { type: 'string', example: 'alice@company.com' },
            role:       { type: 'string', enum: ['Admin', 'Coordinator', 'Teacher', 'Participant'] },
            department: { type: 'string', example: 'Engineering' },
            position:   { type: 'string', example: 'Senior Dev' },
            status:     { type: 'string', enum: ['Active', 'Inactive', 'Dropped', 'Transferred', 'On-hold', 'Waiting for class'] },
            mfaEnabled: { type: 'boolean', example: false },
          },
        },
        Class: {
          type: 'object',
          properties: {
            _id:      { type: 'string' },
            name:     { type: 'string', example: 'React Fundamentals' },
            status:   { type: 'string', enum: ['Active', 'Inactive', 'Draft'] },
            capacity: { type: 'integer', example: 20 },
          },
        },
      },
    },
    security: [{ cookieAuth: [] }],
    tags: [
      { name: 'Auth',        description: 'Authentication & MFA' },
      { name: 'Users',       description: 'User management (Admin only for write operations)' },
      { name: 'Classes',     description: 'Class/course management' },
      { name: 'Schedules',   description: 'Schedule and slot booking' },
      { name: 'Attendance',  description: 'Attendance recording and analytics' },
      { name: 'Export',      description: 'HR data export' },
      { name: 'Settings',    description: 'System settings (Admin only)' },
      { name: 'Cron',        description: 'External cron endpoints (CRON_TOKEN auth)' },
      { name: 'Health',      description: 'Health and readiness probes' },
    ],
  },
  apis: [
    require('path').join(__dirname, '../routes/*.js'),
    require('path').join(__dirname, '../controllers/*.js'),
    // DOCS-006 (audit round 8): the domain routers are the majority API
    // surface — without this glob their @openapi annotations can never
    // appear in /api/docs. Coverage is still sparse (annotate-over-time).
    require('path').join(__dirname, '../domains/**/*.js'),
  ],
};

const spec = swaggerJsdoc(options);
module.exports = { spec };
