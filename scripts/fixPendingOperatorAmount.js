/**
 * Fix the stale operatorAmount on PENDING (not-yet-wallet-released) bookings only.
 *
 * Legacy bookings stored operatorAmount = totalAmount - platformFee, which wrongly
 * leaves GST inside the operator payout. This recomputes the correct payout:
 *     operatorAmount = netFare - platformFee + addonSurcharge   (GST stays w/ platform)
 * and backfills fareSubtotal for record-keeping.
 *
 * SAFETY:
 *   - Only touches bookings where walletReleased !== true (money not yet moved).
 *   - Never changes totalAmount (the real amount the user paid).
 *   - Leaves gstAmount / platformFeeAmount as recorded.
 *   - Already-released bookings are intentionally skipped (per decision).
 *
 *   node scripts/fixPendingOperatorAmount.js          (dry run — shows changes)
 *   node scripts/fixPendingOperatorAmount.js --apply  (writes changes)
 */

require("dotenv").config();
const mongoose = require("mongoose");
const TripBooking = require("../models/TripBooking");

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const APPLY = process.argv.includes("--apply");

async function main() {
  const MONGO_URI = process.env.mongodburl;
  if (!MONGO_URI) {
    console.error("❌ mongodburl not found in .env");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  console.log("✅ MongoDB connected");
  console.log(
    APPLY ? "MODE: APPLY (writing)\n" : "MODE: DRY RUN (no writes)\n",
  );

  // Pending = not yet released to operator wallet
  const bookings = await TripBooking.find({
    walletReleased: { $ne: true },
    status: { $in: ["CONFIRMED", "COMPLETED", "PENDING"] },
  });

  let fixed = 0;
  let totalCorrection = 0;

  console.log(
    "BOOKING        seats fareSubtotal  netFare    platFee   surcharge  oldOp      newOp      diff",
  );
  console.log(
    "──────────────────────────────────────────────────────────────────────────────────────────",
  );

  for (const b of bookings) {
    const p = b.pricing || {};
    const seats = Number(p.seats || b.seats || 1);
    const realFareSubtotal =
      Number(p.fareSubtotal) > 0
        ? Number(p.fareSubtotal)
        : Math.round(Number(p.adultPrice || 0) * seats);
    const discount = Number(p.discountAmount) || 0;
    const netFare = Math.max(0, realFareSubtotal - discount);
    const platformFee = Number(p.platformFeeAmount) || 0;
    const surcharge = Number(b.addonSurcharge) || 0;

    const correctOperator = netFare - platformFee + surcharge;
    const oldOperator = Number(p.operatorAmount) || 0;
    const diff = correctOperator - oldOperator;

    // Skip if already correct and fareSubtotal already populated
    const fareNeedsBackfill =
      !(Number(p.fareSubtotal) > 0) && realFareSubtotal > 0;
    if (Math.abs(diff) < 1 && !fareNeedsBackfill) continue;

    console.log(
      `${b.bookingId.padEnd(14)} ${String(seats).padEnd(5)} ${inr(realFareSubtotal).padEnd(13)} ${inr(
        netFare,
      ).padEnd(
        10,
      )} ${inr(platformFee).padEnd(9)} ${inr(surcharge).padEnd(10)} ${inr(
        oldOperator,
      ).padEnd(10)} ${inr(correctOperator).padEnd(10)} ${inr(diff)}`,
    );

    if (APPLY) {
      b.pricing.fareSubtotal = realFareSubtotal; // backfill
      b.pricing.operatorAmount = correctOperator; // correct payout (GST excluded)
      b.markModified("pricing");
      await b.save();
    }
    fixed++;
    totalCorrection += diff;
  }

  console.log(
    "──────────────────────────────────────────────────────────────────────────────────────────",
  );
  console.log(`Pending bookings scanned : ${bookings.length}`);
  console.log(`Bookings ${APPLY ? "fixed" : "to fix"}        : ${fixed}`);
  console.log(
    `Total payout reduction   : ${inr(-totalCorrection)} (GST kept with platform)`,
  );
  if (!APPLY) console.log("\nRe-run with --apply to write these changes.");
}

main()
  .catch((e) => console.error("Error:", e))
  .finally(async () => {
    await mongoose.disconnect();
    console.log("\n✅ Disconnected.");
  });
