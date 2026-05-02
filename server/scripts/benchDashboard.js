const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  // Login — get the Set-Cookie header
  const loginRes = await request({
    hostname: 'localhost', port: 5000, path: '/api/auth/login',
    method: 'POST', headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ empCode: '000001', password: 'admin12345' }));

  // Extract cookie from Set-Cookie header
  const setCookies = loginRes.headers['set-cookie'] || [];
  const cookie = setCookies.map(c => c.split(';')[0]).join('; ');
  const token = JSON.parse(loginRes.body).token;
  const auth = { Cookie: cookie, Authorization: 'Bearer ' + token };
  console.log('Logged in, cookie:', cookie ? 'YES' : 'NO', 'token:', token ? 'YES' : 'NO');
  console.log('');

  // Benchmark dashboard/stats (cold)
  const t1 = Date.now();
  const dash = await request({ hostname: 'localhost', port: 5000, path: '/api/dashboard/stats', headers: auth });
  const dashTime = Date.now() - t1;
  console.log(`Dashboard Stats (cold): ${dashTime}ms | Status: ${dash.status} | Size: ${dash.body.length} bytes | X-Cache: ${dash.headers['x-cache'] || 'N/A'}`);

  // Benchmark schedules
  const t2 = Date.now();
  const sched = await request({ hostname: 'localhost', port: 5000, path: '/api/schedules?limit=5', headers: auth });
  const schedTime = Date.now() - t2;
  console.log(`Schedules:              ${schedTime}ms | Status: ${sched.status} | Size: ${sched.body.length} bytes`);

  // 2nd dashboard call (should be cached)
  const t3 = Date.now();
  const dash2 = await request({ hostname: 'localhost', port: 5000, path: '/api/dashboard/stats', headers: auth });
  const dashTime2 = Date.now() - t3;
  console.log(`Dashboard Stats (warm): ${dashTime2}ms | Status: ${dash2.status} | X-Cache: ${dash2.headers['x-cache'] || 'N/A'}`);

  console.log(`\n==> TOTAL first load: ${dashTime + schedTime}ms`);
}

run().catch(e => console.error('Error:', e.message));
