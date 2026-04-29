const mongoose = require('mongoose');
require('dotenv').config();
const Setting = require('./models/Setting');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const setting = await Setting.findOne({ key: 'ALLOWED_TIME_SLOTS' });
  if (setting && !setting.value.find(s => s.sh === 9)) {
    setting.value.unshift({ sh: 9, sm: 0, eh: 10, em: 0 });
    setting.markModified('value');
    await setting.save();
    console.log('Added 9-10 AM');
  }
  process.exit(0);
});
