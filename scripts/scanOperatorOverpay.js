/**
 * Scan ALL bookings for the legacy operatorAmount bug (GST left inside operator payout).
 * READ-ONLY — does not change anything.
 *
 *   node scripts/scanOperatorOverpay.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const TripBooking = require("../models/TripBooking");

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

async function main() {
  const MONGO_URI = process.env.mongodburl;
  if (!MONGO_URI) {
    console.error("❌ mongodburl not found in .env");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  console.log("✅ MongoDB connected\n");

  const bookings = await TripBooking.find({
    status: { $in: ["CONFIRMED", "COMPLETED"] },
  }).lean();

  let affected = 0;
  let releasedWrong = 0;
  let totalOverpay = 0;
  let totalReleasedOverpay = 0;

  console.log(
    "BOOKING        STATUS     RELEASED  storedOp   correctOp  overpay   note",
  );
  console.log(
    "──────────────────────────────────────────────────────────────────────────",
  );

  for (const b of bookings) {
    const p = b.pricing || {};
    const seats = Number(p.seats || b.seats || 1);
    // real fare: prefer stored fareSubtotal, else derive from adultPrice * seats
    const realFareSubtotal =
      Number(p.fareSubtotal) > 0
        ? Number(p.fareSubtotal)
        : Math.round(Number(p.adultPrice || 0) * seats);
    const discount = Number(p.discountAmount) || 0;
    const netFare = Math.max(0, realFareSubtotal - discount);
    const platformFee = Number(p.platformFeeAmount) || 0;
    const surcharge = Number(b.addonSurcharge) || 0;

    const correctOperator = netFare - platformFee + surcharge;
    const storedOperator = Number(p.operatorAmount) || 0;
    const overpay = storedOperator - correctOperator;

    if (Math.abs(overpay) >= 1) {
      affected++;
      totalOverpay += overpay;
      if (b.walletReleased) {
        releasedWrong++;
        totalReleasedOverpay += overpay;
      }
      console.log(
        `${b.bookingId.padEnd(14)} ${String(b.status).padEnd(10)} ${String(
          !!b.walletReleased,
        ).padEnd(8)} ${inr(storedOperator).padEnd(10)} ${inr(
          correctOperator,
        ).padEnd(10)} ${inr(overpay).padEnd(9)} ${
          Number(p.fareSubtotal) > 0 ? "" : "(legacy: fareSubtotal=0)"
        }`,
      );
    }
  }

  console.log(
    "──────────────────────────────────────────────────────────────────────────",
  );
  console.log(`Total bookings scanned        : ${bookings.length}`);
  console.log(`Affected (stale operatorAmount): ${affected}`);
  console.log(`  …already wallet-released     : ${releasedWrong}`);
  console.log(`Total overpay (all affected)   : ${inr(totalOverpay)}`);
  console.log(`Overpay already paid out       : ${inr(totalReleasedOverpay)}`);
  console.log(
    "\nNOTE: 'correctOp' = netFare - platformFee + surcharge (GST stays with platform).",
  );
}

main()
  .catch((e) => console.error("Error:", e))
  .finally(async () => {
    await mongoose.disconnect();
    console.log("\n✅ Disconnected.");
  });
