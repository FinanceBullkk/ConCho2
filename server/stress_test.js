require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { bookSlot } = require('./services/scheduleService');
const Team = require('./models/Team');
const User = require('./models/User');
const Schedule = require('./models/Schedule');
const Class = require('./models/Class');
const Setting = require('./models/Setting');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runStressTest() {
  console.log('🚀 Bắt đầu kịch bản Stress Test (Service-Level Concurrency Test)\n');
  try {
    await connectDB();
    
    // Get test data
    const adminUser = await User.findOne({ empCode: '000001' });
    const teamB = await Team.findOne({ name: /Beta/i });
    
    if (!adminUser || !teamB) {
      throw new Error('Test data not found. Please run `npm run seed` first.');
    }

    const nextWeekStr = (days) => {
      const d = new Date();
      d.setDate(d.getDate() + 14 + days); // push further to avoid weekly limit conflicts
      return d.toISOString().split('T')[0];
    };
    
    const dayStr = nextWeekStr(0);
    const startTimeStr = `${dayStr}T10:00:00.000`;
    const endTimeStr = `${dayStr}T11:00:00.000`;

    // Ensure clean state for this specific time slot
    await Schedule.deleteMany({
      startTime: new Date(startTimeStr),
      endTime: new Date(endTimeStr),
    });

    console.log(`🎯 Mục tiêu: Bắn 100 request Đặt lịch đồng thời (Concurrent) vào cùng 1 khung giờ.`);
    console.log(`⏱️ Thời gian mô phỏng: ${startTimeStr}`);
    console.log('⏳ Đang bắn request...\n');

    // Create 100 concurrent promises bypassing Express Rate Limiter
    // Directly testing the Database Lock Mechanism (E11000 + Transactions)
    const promises = [];
    const iterations = 100;
    
    let successCount = 0;
    let conflictCount = 0;
    let otherErrors = 0;

    for (let i = 0; i < iterations; i++) {
      const p = bookSlot({
        teamId: teamB._id,
        startTime: startTimeStr,
        endTime: endTimeStr,
        requestUser: adminUser,
      })
      .then(() => {
        successCount++;
      })
      .catch((err) => {
        if (err.statusCode === 409 || err.message.includes('already taken')) {
          conflictCount++;
        } else {
          otherErrors++;
          console.error('Unexpected error:', err.message);
        }
      });
      promises.push(p);
    }

    // Wait for all promises to settle
    await Promise.all(promises);

    console.log('📊 KẾT QUẢ STRESS TEST:');
    console.log(`   - Tổng số request bắn đồng thời: ${iterations}`);
    console.log(`   - ✅ Số request thành công (Inserted): ${successCount}`);
    console.log(`   - 🛡️ Số request bị chặn do trùng giờ (409 Conflict): ${conflictCount}`);
    if (otherErrors > 0) {
      console.log(`   - ❌ Lỗi khác: ${otherErrors}`);
    }

    console.log('\n💡 KẾT LUẬN:');
    if (successCount === 1 && conflictCount === iterations - 1) {
      console.log('   Tuyệt vời! Database Transaction và Unique Index hoạt động hoàn hảo.');
      console.log('   Mặc dù 100 người ấn đặt lịch trong cùng 1 mili-giây, hệ thống chỉ chấp nhận đúng 1 người.');
      console.log('   => Đã triệt tiêu hoàn toàn lỗi Race Condition (Double Booking).');
    } else {
      console.log('   Có vấn đề xảy ra: Kết quả không như mong đợi (Có thể do mạng, hoặc logic chưa an toàn).');
    }

  } catch (error) {
    console.error('❌ Lỗi hệ thống:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

runStressTest();
