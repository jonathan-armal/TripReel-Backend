/**
 * Lists operators that have cached RazorpayX contact/fund-account ids.
 * If the RazorpayX account/keys changed, these become stale and must be cleared.
 *   node scripts/checkOperatorRzpIds.js          (list)
 *   node scripts/checkOperatorRzpIds.js --clear   (clear them so they recreate)
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { Operator } = require("../models/Operator");
const CLEAR = process.argv.includes("--clear");

(async () => {
  await mongoose.connect(process.env.mongodburl);
  const ops = await Operator.find({
    $or: [
      { razorpayContactId: { $gt: "" } },
      { razorpayFundAccountId: { $gt: "" } },
    ],
  }).select("email razorpayContactId razorpayFundAccountId");

  if (ops.length === 0) {
    console.log("No operators have cached RazorpayX ids ✅ (nothing to clear)");
  } else {
    ops.forEach((o) =>
      console.log(
        `${o.email}  contact=${o.razorpayContactId || "-"}  fund=${o.razorpayFundAccountId || "-"}`,
      ),
    );
    if (CLEAR) {
      const r = await Operator.updateMany(
        {},
        {
          $set: {
            razorpayContactId: "",
            razorpayFundAccountId: "",
            razorpayFundFingerprint: "",
          },
        },
      );
      console.log(`\nCleared cached ids on ${r.modifiedCount} operators ✅`);
    } else {
      console.log(
        "\nRun with --clear to reset these (they'll recreate on next withdrawal).",
      );
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
