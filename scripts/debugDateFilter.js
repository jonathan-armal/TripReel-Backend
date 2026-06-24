/**
 * Debugs the date filter for a given date.
 *   node scripts/debugDateFilter.js 2026-07-05
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Batch = require("../models/Batch");
const Package = require("../models/Package");

const dateArg = process.argv[2] || "2026-07-05";

(async () => {
  await mongoose.connect(process.env.mongodburl);
  console.log("✅ Connected\n");

  // 1. Find Nandi Hills package
  const pkg = await Package.findOne({
    title: { $regex: "nandi", $options: "i" },
  }).lean();

  if (!pkg) {
    console.log("❌ No package found matching 'Nandi Hills'");
  } else {
    console.log(
      "Package found:",
      pkg.title,
      "| isActive:",
      pkg.isActive,
      "| status:",
      pkg.status,
    );

    // 2. Check its batches raw
    const allBatches = await Batch.find({ packageId: pkg._id }).lean();
    console.log(`\nAll batches for this package (${allBatches.length}):`);
    allBatches.forEach((b) => {
      console.log(
        `  id=${b._id} | startDate=${b.startDate} | endDate=${b.endDate} | isActive=${b.isActive}`,
      );
    });
  }

  // 3. Simulate the new backend date filter (startDate on chosen day, IST-aware)
  console.log(
    `\n--- Simulating ?date=${dateArg} (NEW: startDate-only, IST-aware) ---`,
  );
  const [y, m, d] = dateArg.split("-").map(Number);
  const dayStartIST = new Date(Date.UTC(y, m - 1, d) - 5.5 * 60 * 60 * 1000);
  const dayEndIST = new Date(dayStartIST.getTime() + 24 * 60 * 60 * 1000);
  console.log(
    "dayStartIST:",
    dayStartIST.toISOString(),
    "→ local:",
    dayStartIST.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
  );
  console.log(
    "dayEndIST:  ",
    dayEndIST.toISOString(),
    "→ local:",
    dayEndIST.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
  );

  const batchQuery = {
    isActive: true,
    startDate: { $gte: dayStartIST, $lt: dayEndIST },
  };

  const matchingBatches = await Batch.find(batchQuery)
    .populate("packageId", "title isActive status")
    .lean();

  console.log(`\nBatches matching date (${matchingBatches.length}):`);
  matchingBatches.forEach((b) => {
    console.log(
      `  batchId=${b._id} | pkg="${b.packageId?.title}" | isActive=${b.packageId?.isActive} | status=${b.packageId?.status}`,
    );
  });

  if (matchingBatches.length === 0) {
    console.log(
      "\n⚠️  NO batches found for this date — check startDate/endDate values in DB",
    );
  } else {
    const packageIds = [
      ...new Set(matchingBatches.map((b) => b.packageId?._id?.toString())),
    ];
    console.log("\nPackageIds to return:", packageIds);

    // Check if those packages pass the isActive+APPROVED filter
    const finalPkgs = await Package.find({
      _id: { $in: packageIds },
      isActive: true,
      status: "APPROVED",
    })
      .select("title isActive status")
      .lean();

    console.log(
      `\nFinal packages after isActive+APPROVED filter (${finalPkgs.length}):`,
    );
    finalPkgs.forEach((p) =>
      console.log(
        `  "${p.title}" | isActive=${p.isActive} | status=${p.status}`,
      ),
    );

    if (finalPkgs.length === 0) {
      console.log(
        "❌ Package exists but is BLOCKED by isActive=false or status≠APPROVED",
      );
    }
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
