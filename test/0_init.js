
const mongoose = require('mongoose');

const url = process.env.DB_URL || "mongodb://localhost:27017/test";
mongoose.connect(url);

console.clear();