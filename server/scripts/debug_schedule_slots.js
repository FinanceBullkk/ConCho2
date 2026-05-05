require('dotenv').config();
const connectDB = require('../config/db');
const Schedule = require('../models/Schedule');

(async () => {
  await connectDB();
  
  const all = await Schedule.find().select('startTime endTime').lean();
  
  const TIME_SLOTS = ['09:00-10:00', '10:00-11:00', '11:00-12:00', '13:00-14:00', '14:00-15:00', '15:00-16:00'];
  
  // Count how many match vs don't match
  let matchCount = 0;
  let noMatchCount = 0;
  const slotCounts = {};
  
  all.forEach(sch => {
    const s = new Date(sch.startTime);
    const e = new Date(sch.endTime);
    const slot = `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}-${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
    
    if (!slotCounts[slot]) slotCounts[slot] = 0;
    slotCounts[slot]++;
    
    if (TIME_SLOTS.includes(slot)) matchCount++;
    else noMatchCount++;
  });
  
  console.log(`\nTotal: ${all.length}`);
  console.log(`Match TIME_SLOTS: ${matchCount}`);
  console.log(`DON'T match: ${noMatchCount}`);
  console.log(`\nSlot breakdown:`);
  Object.entries(slotCounts).sort((a, b) => b[1] - a[1]).forEach(([slot, count]) => {
    const match = TIME_SLOTS.includes(slot) ? '✅' : '❌';
    console.log(`  ${match} ${slot}: ${count} sessions`);
  });
  
  process.exit(0);
})();
