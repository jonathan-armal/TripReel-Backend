/**
 * Checks for duplicate operator phones/emails that would block the new unique index.
 *   node scripts/checkDupOperatorPhones.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { Operator } = require("../models/Operator");

(async () => {
  await mongoose.connect(process.env.mongodburl);
  const dupPhones = await Operator.aggregate([
    { $match: { phone: { $gt: "" } } },
    { $group: { _id: "$phone", count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  const dupEmails = await Operator.aggregate([
    { $group: { _id: "$email", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  console.log("Duplicate phones:", dupPhones.length ? dupPhones : "none ✅");
  console.log("Duplicate emails:", dupEmails.length ? dupEmails : "none ✅");
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
