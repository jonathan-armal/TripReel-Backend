require("dotenv").config();
const mongoose = require("mongoose");
const Review = require("../models/Review");
const Package = require("../models/Package");

async function main() {
  await mongoose.connect(process.env.mongodburl);
  console.log("✅ Connected\n");

  // Group reviews per package
  const pkgs = await Package.find({})
    .select("title avgRating rating reviewCount")
    .lean();

  for (const p of pkgs) {
    const reviews = await Review.find({ packageId: p._id })
      .select("rating userId isVisible")
      .lean();
    if (reviews.length === 0) continue;

    const visible = reviews.filter((r) => r.isVisible !== false);
    const trueAvg =
      visible.length > 0
        ? visible.reduce((s, r) => s + r.rating, 0) / visible.length
        : 0;

    console.log(`📦 ${p.title}`);
    console.log(
      `   stored avgRating: ${p.avgRating} | rating: ${p.rating} | reviewCount: ${p.reviewCount}`,
    );
    console.log(
      `   actual reviews (${reviews.length} total, ${visible.length} visible): [${reviews.map((r) => r.rating).join(", ")}]`,
    );
    console.log(`   computed true avg: ${Math.round(trueAvg * 10) / 10}`);
    // Check for duplicate userIds (would indicate multiple reviews per user — shouldn't happen)
    const userIds = visible.map((r) => String(r.userId));
    const dupes = userIds.length !== new Set(userIds).size;
    if (dupes) console.log(`   ⚠️ DUPLICATE reviews from same user detected!`);
    console.log("");
  }

  await mongoose.disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
