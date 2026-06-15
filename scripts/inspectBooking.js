/**
 * Inspect a single booking's money flow + the operator wallet transactions tied to it.
 *
 * Run from TripReel-Backend:
 *   node scripts/inspectBooking.js TR-BKG-000013
 */

require("dotenv").config();
const mongoose = require("mongoose");

const TripBooking = require("../models/TripBooking");
const Batch = require("../models/Batch");
const WalletTransaction = require("../models/WalletTransaction");
const OperatorWallet = require("../models/OperatorWallet");

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

async function main() {
  const MONGO_URI = process.env.mongodburl;
  if (!MONGO_URI) {
    console.error("❌ mongodburl not found in .env");
    process.exit(1);
  }

  const bookingId = process.argv[2] || "TR-BKG-000013";

  await mongoose.connect(MONGO_URI);
  console.log("✅ MongoDB connected\n");

  const b = await TripBooking.findOne({ bookingId }).lean();
  if (!b) {
    console.log(`❌ Booking ${bookingId} not found`);
    return;
  }

  const batch = b.batchId ? await Batch.findById(b.batchId).lean() : null;
  const p = b.pricing || {};

  console.log("════════════════════════════════════════════════════");
  console.log(`  BOOKING ${b.bookingId}`);
  console.log("════════════════════════════════════════════════════");
  console.log("Status            :", b.status);
  console.log("Seats             :", b.seats);
  console.log("walletReleased    :", b.walletReleased);
  console.log("addonHeld         :", b.addonHeld);
  console.log("addonDispatched   :", b.addonDispatched);
  console.log("razorpayPaymentId :", b.razorpayPaymentId || "(none)");
  console.log("Trip startDate    :", b.snapshot?.startDate);
  console.log(
    "Trip endDate      :",
    b.snapshot?.endDate,
    batch ? "(batch: " + batch.endDate + ")" : "",
  );
  console.log("");

  console.log("──────── PRICING SNAPSHOT (what was stored) ────────");
  console.log("adultPrice        :", inr(p.adultPrice));
  console.log(
    "fareSubtotal      :",
    inr(p.fareSubtotal),
    `(adultPrice x ${p.seats})`,
  );
  console.log(
    "discountAmount    :",
    inr(p.discountAmount),
    p.couponCode ? `(coupon ${p.couponCode})` : "",
  );
  console.log(
    "addonAmount       :",
    inr(p.addonAmount),
    "(Snapja base + outside-city surcharge, HELD by platform)",
  );
  console.log("gstPercent        :", (p.gstPercent || 0) + "%");
  console.log("gstAmount         :", inr(p.gstAmount), "→ PLATFORM");
  console.log("platformFeePercent:", (p.platformFeePercent || 0) + "%");
  console.log("platformFeeAmount :", inr(p.platformFeeAmount), "→ PLATFORM");
  console.log(
    "addonSurcharge    :",
    inr(b.addonSurcharge),
    "(outside-city portion → operator)",
  );
  console.log("──────────────────────────────────────────────────");
  console.log("totalAmount (user paid):", inr(p.totalAmount));
  console.log("operatorAmount (should get):", inr(p.operatorAmount));
  console.log("");

  // ── Re-derive the numbers from formula to verify ──
  const fareSubtotal = Number(p.fareSubtotal) || 0;
  const discount = Number(p.discountAmount) || 0;
  const netFare = Math.max(0, fareSubtotal - discount);
  const addon = Number(p.addonAmount) || 0;
  const gst = Number(p.gstAmount) || 0;
  const platformFee = Number(p.platformFeeAmount) || 0;
  const surcharge = Number(b.addonSurcharge) || 0;

  const expectedTotal = netFare + addon + gst;
  const expectedOperator = netFare - platformFee + surcharge;

  console.log("──────── FORMULA RE-CHECK ────────");
  console.log(
    `netFare            = fareSubtotal - discount = ${inr(fareSubtotal)} - ${inr(discount)} = ${inr(netFare)}`,
  );
  console.log(
    `expected total     = netFare + addon + gst   = ${inr(netFare)} + ${inr(addon)} + ${inr(gst)} = ${inr(expectedTotal)}`,
  );
  console.log(
    `  stored total     = ${inr(p.totalAmount)}  ${expectedTotal === p.totalAmount ? "✅ match" : "❌ MISMATCH"}`,
  );
  console.log(
    `expected operator  = netFare - platformFee + surcharge = ${inr(netFare)} - ${inr(platformFee)} + ${inr(surcharge)} = ${inr(expectedOperator)}`,
  );
  console.log(
    `  stored operator  = ${inr(p.operatorAmount)}  ${expectedOperator === p.operatorAmount ? "✅ match" : "❌ MISMATCH"}`,
  );
  console.log("");
  console.log(
    "Platform keeps     = gst + platformFee =",
    inr(gst + platformFee),
  );
  console.log(
    "Snapja (held/dispatched) =",
    inr(addon - surcharge),
    "base +",
    inr(surcharge),
    "surcharge → operator",
  );
  console.log("");

  // ── Actual wallet transactions tied to this booking ──
  const txns = await WalletTransaction.find({ bookingId: b._id })
    .sort({ createdAt: 1 })
    .lean();
  console.log("──────── ACTUAL WALLET TRANSACTIONS for this booking ────────");
  if (txns.length === 0) {
    console.log("(none — operator has not been credited yet for this booking)");
  } else {
    let sum = 0;
    txns.forEach((t) => {
      const sign = t.type === "CREDIT" ? "+" : "-";
      sum += t.type === "CREDIT" ? t.amount : -t.amount;
      console.log(
        `  ${new Date(t.createdAt).toISOString()}  ${t.type.padEnd(6)} ${sign}${inr(t.amount).padEnd(10)} balAfter=${inr(t.balanceAfter)}  "${t.description}"`,
      );
    });
    console.log("  ──────────────");
    console.log("  Net credited to operator from this booking:", inr(sum));
    if (txns.filter((t) => t.type === "CREDIT").length > 1) {
      console.log(
        "  ⚠️  MORE THAN ONE CREDIT — possible double credit, investigate!",
      );
    }
  }
  console.log("");

  // ── Operator's current wallet ──
  if (b.operatorId) {
    const w = await OperatorWallet.findOne({ operatorId: b.operatorId }).lean();
    if (w) {
      console.log("──────── OPERATOR WALLET (current) ────────");
      console.log("balance     :", inr(w.balance));
      console.log("totalEarned :", inr(w.totalEarned));
    }
  }
  console.log("════════════════════════════════════════════════════");
}

main()
  .catch((e) => console.error("Error:", e))
  .finally(async () => {
    await mongoose.disconnect();
    console.log("\n✅ Disconnected.");
  });
