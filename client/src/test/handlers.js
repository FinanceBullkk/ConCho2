import { http, HttpResponse } from 'msw';

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
];
