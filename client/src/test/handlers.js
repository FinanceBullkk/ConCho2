import { http, HttpResponse } from 'msw';

// Shorthand for the standard success envelope `{ success, data }`.
const ok = (data, extra = {}) => HttpResponse.json({ success: true, data, ...extra });

export const handlers = [
  // Auth
  http.get('/api/auth/me', () =>
    HttpResponse.json({
      success: true,
      data: {
        _id: 'user-1',
        empCode: '000001',
        name: 'Test Admin',
        role: 'Admin',
        status: 'Active',
        mfaEnabled: false,
      },
    })
  ),

  http.post('/api/auth/login', () =>
    HttpResponse.json({
      success: true,
      data: { _id: 'user-1', empCode: '000001', name: 'Test Admin', role: 'Admin' },
    })
  ),

  // Users
  http.get('/api/users', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') || 1);
    return HttpResponse.json({
      success: true,
      data: [
        { _id: 'u1', empCode: '000001', name: 'Alice Admin', role: 'Admin', status: 'Active' },
        { _id: 'u2', empCode: '000002', name: 'Bob Teacher', role: 'Teacher', status: 'Active' },
      ],
      meta: { total: 2, page, totalPages: 1, limit: 20 },
    });
  }),

  // Classes
  http.get('/api/classes', () =>
    HttpResponse.json({
      success: true,
      data: [
        { _id: 'c1', name: 'React Fundamentals', status: 'Active', capacity: 20 },
      ],
      meta: { total: 1, page: 1, totalPages: 1, limit: 20 },
    })
  ),

  // ── Feature-hook reads/writes (batch 2 — data-layer coverage) ──
  // Rooms
  http.get('/api/rooms', () => ok([{ _id: 'r1', name: 'Room A', officeId: 'o1' }])),
  http.post('/api/rooms', () => ok({ _id: 'r2', name: 'Room B' })),
  http.put('/api/rooms/:id', () => ok({ _id: 'r1', name: 'Room A (edited)' })),
  http.delete('/api/rooms/:id', () => ok({ _id: 'r1', isDeleted: true })),

  // Vendors
  http.get('/api/vendors', () => ok([{ _id: 'v1', name: 'Acme Training' }])),
  http.get('/api/vendors/:id/spend', () => ok({ total: 1000, byMonth: [] })),
  http.get('/api/vendors/:id', () => ok({ _id: 'v1', name: 'Acme Training' })),
  http.post('/api/vendors', () => ok({ _id: 'v2', name: 'New Vendor' })),

  // Trainers
  http.get('/api/trainers', () => ok([{ _id: 't1', name: 'Trainer One' }])),
  http.get('/api/trainers/:id/load', () => ok({ sessions: 3, hours: 12 })),

  // Skills
  http.get('/api/skills/taxonomy', () => ok([{ _id: 'cat1', name: 'Frontend' }])),
  http.get('/api/skills/role-profiles', () => ok([{ role: 'Teacher', required: [] }])),
  http.get('/api/skills/learner/:userId/recommendations', () => ok([])),
  http.get('/api/skills/learner/:userId', () => ok({ proficiency: [], gap: [] })),
  http.get('/api/skills', () => ok({ skills: [{ _id: 's1', name: 'React' }], categories: [] })),
  http.post('/api/skills', () => ok({ _id: 's2', name: 'Vue' })),

  // Notifications (feed returns the full envelope, not data.data)
  http.get('/api/notifications/mine', () =>
    HttpResponse.json({ success: true, data: [{ _id: 'n1', read: false }], unreadCount: 1, count: 1 })
  ),
  http.get('/api/notifications/preferences', () => ok({ inApp: true, email: false })),

  // Compliance
  http.get('/api/compliance/matrix', () => ok({ rows: [], requirements: [] })),

  // Org
  http.get('/api/org/departments', () => ok([{ _id: 'd1', name: 'Engineering' }])),
  http.get('/api/org/offices', () => ok([{ _id: 'o1', name: 'HQ' }])),
  http.get('/api/org/my-team', () => ok([{ _id: 'u3', name: 'Direct Report' }])),
  http.post('/api/org/departments', () => ok({ _id: 'd2', name: 'Sales' })),
];
