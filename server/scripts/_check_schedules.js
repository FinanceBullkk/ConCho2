const http = require('http');

function apiGet(path, token) {
  return new Promise((res, rej) => {
    const req = http.request({
      hostname: 'localhost', port: 3000,
      path: '/api' + path, method: 'GET',
      headers: { Authorization: 'Bearer ' + token }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { res(JSON.parse(d)); } catch(e) { rej(new Error(d)); }
      });
    });
    req.on('error', rej);
    req.end();
  });
}

function apiPost(path, body) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: 3000,
      path: '/api' + path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { res(JSON.parse(d)); } catch(e) { rej(new Error(d)); }
      });
    });
    req.on('error', rej);
    req.end(data);
  });
}

(async () => {
  // Login
  const login = await apiPost('/auth/login', { empCode: '000001', password: 'Anh08102003!' });
  if (!login.data?.token) {
    console.log('Login failed:', login);
    // Try another password
    const login2 = await apiPost('/auth/login', { empCode: '000001', password: 'admin123' });
    if (!login2.data?.token) {
      console.log('Login2 failed:', login2);
      process.exit(1);
    }
    var token = login2.data.token;
  } else {
    var token = login.data.token;
  }

  // Get schedules with sort
  const sched = await apiGet('/schedules?limit=200&sort=-startTime', token);
  console.log('=== SCHEDULE OVERVIEW ===');
  console.log('Total returned:', sched.total || sched.count);
  
  if (sched.data && sched.data.length > 0) {
    console.log('Latest:', sched.data[0].startTime, '-', sched.data[0].classId?.classCode);
    console.log('Earliest (in this batch):', sched.data[sched.data.length - 1].startTime, '-', sched.data[sched.data.length - 1].classId?.classCode);
    
    // Group by year-month
    const byMonth = {};
    sched.data.forEach(s => {
      const d = new Date(s.startTime);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      byMonth[key] = (byMonth[key] || 0) + 1;
    });
    console.log('\n=== SCHEDULES BY MONTH ===');
    Object.keys(byMonth).sort().forEach(k => console.log(k, ':', byMonth[k]));
  }

  // Get classes
  const cls = await apiGet('/classes', token);
  console.log('\n=== ACTIVE CLASSES ===');
  (cls.data || []).filter(c => c.status === 'active').forEach(c => {
    console.log(c.classCode, '|', c.courseId?.name || c.courseName, '| sessions:', c.sessionsCompleted, '/', c.expectedSessions);
  });

})();
