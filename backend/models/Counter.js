const mongoose = require('mongoose');

/** Named sequences, bumped atomically — e.g. receipt numbers per year. */
const counterSchema = new mongoose.Schema({
  _id: { type: String }, // e.g. 'receipt-2026'
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function next(name) {
  const doc = await this.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
