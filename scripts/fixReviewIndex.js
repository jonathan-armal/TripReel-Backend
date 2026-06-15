/**
 * Migration: switch reviews from one-per-user-per-package → one-per-booking.
 *
 *  1. Drops the old unique index { packageId:1, userId:1 } if present
 *  2. Lets Mongoose create the new unique index on bookingRef
 *  3. Recalculates avgRating / reviewCount for every package
 *
 * Run from TripReel-Backend:
 *   node scripts/fixReviewIndex.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Review = require("../models/Review");
const Package = require("../models/Package");

async function recalc(packageId) {
  const agg = await Review.aggregate([
    {
      $match: {
        packageId: new mongoose.Types.ObjectId(packageId),
        isVisible: true,
      },
    },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const avg = agg[0]?.avg || 0;
  const count = agg[0]?.count || 0;
  const rounded = Math.round(avg * 10) / 10;
  await Package.findByIdAndUpdate(packageId, {
    avgRating: rounded,
    rating: rounded,
    reviewCount: count,
  });
  return { rounded, count };
}

async function main() {
  await mongoose.connect(process.env.mongodburl);
  console.log("✅ Connected\n");

  // ── Step 1: drop the old unique index ───────────────────────────────────────
  const indexes = await Review.collection.indexes();
  const old = indexes.find(
    (ix) => ix.key && ix.key.packageId === 1 && ix.key.userId === 1,
  );
  if (old) {
    await Review.collection.dropIndex(old.name);
    console.log(`🗑️  Dropped old index: ${old.name}`);
  } else {
    console.log(
      "ℹ️  Old {packageId,userId} index not found (already removed).",
    );
  }

  // ── Step 2: sync new indexes from schema ─────────────────────────────────────
  await Review.syncIndexes();
  console.log("✅ Indexes synced (bookingRef unique index ensured).\n");

  // ── Step 3: recalc all package ratings ───────────────────────────────────────
  const pkgs = await Package.find({}).select("_id title").lean();
  let updated = 0;
  for (const p of pkgs) {
    const { rounded, count } = await recalc(p._id);
    if (count > 0) {
      console.log(`  ${p.title}: avg ${rounded} (${count} reviews)`);
      updated++;
    }
  }
  console.log(`\n✅ Recalculated ${updated} package(s) with reviews.`);

  await mongoose.disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error("❌ Failed:", e);
  process.exit(1);
});
