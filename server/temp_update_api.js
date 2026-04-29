const loginAndUpdate = async () => {
  const loginRes = await fetch('http://127.0.0.1:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empCode: '000001', password: 'admin12345' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.token;

  const getRes = await fetch('http://127.0.0.1:5000/api/settings', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const getData = await getRes.json();
  
  const timeSlots = getData.data.find(s => s.key === 'ALLOWED_TIME_SLOTS');
  if (!timeSlots.value.find(s => s.sh === 9)) {
    timeSlots.value.unshift({ sh: 9, sm: 0, eh: 10, em: 0 });
    const updateRes = await fetch('http://127.0.0.1:5000/api/settings', {
      method: 'PUT',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        settings: [{ key: 'ALLOWED_TIME_SLOTS', value: timeSlots.value }]
      })
    });
    console.log('Updated via API');
  } else {
    console.log('Already exists');
  }
};
loginAndUpdate().catch(console.error);
