const TripBooking = require("../models/TripBooking");
const Batch = require("../models/Batch");

/**
 * Cron Job Logic
 *
 * Job 1 — Auto-complete confirmed bookings where batch.endDate has passed
 * Job 2 — Auto-cancel pending bookings where batch.bookingDeadline has passed
 *
 * This is exposed as a manual admin trigger endpoint for now.
 * Wire to node-cron later: run daily at midnight.
 */
async function runCronJobs() {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const results = { completed: 0, cancelled: 0, walletReleased: 0, errors: [] };

  try {
    // ── Job 1: Auto-complete confirmed bookings where endDate + 2 days passed ──
    const confirmedBookings = await TripBooking.find({
      status: "CONFIRMED",
    }).populate("batchId", "endDate");

    for (const booking of confirmedBookings) {
      try {
        if (booking.batchId && booking.batchId.endDate < twoDaysAgo) {
          booking.status = "COMPLETED";
          booking.hasReviewed = false;
          await booking.save();
          results.completed++;

          // Release funds to operator wallet (2 days after trip end)
          const OperatorWallet = require("../models/OperatorWallet");
          const WalletTransaction = require("../models/WalletTransaction");

          const wallet = await OperatorWallet.findOneAndUpdate(
            { operatorId: booking.operatorId },
            {
              $inc: {
                balance: booking.pricing.operatorAmount,
                totalEarned: booking.pricing.operatorAmount,
              },
            },
            { upsert: true, new: true },
          );

          await WalletTransaction.create({
            operatorId: booking.operatorId,
            bookingId: booking._id,
            type: "CREDIT",
            amount: booking.pricing.operatorAmount,
            description: `Booking ${booking.bookingId} — funds released after trip completion`,
            balanceAfter: wallet.balance,
          });

          results.walletReleased++;
        }
      } catch (e) {
        results.errors.push(`Auto-complete ${booking.bookingId}: ${e.message}`);
      }
    }

    // ── Job 2: Auto-cancel expired pending bookings ────────────────────────
    const pendingBookings = await TripBooking.find({
      status: "PENDING",
    }).populate("batchId", "bookingDeadline");

    for (const booking of pendingBookings) {
      try {
        if (booking.batchId && booking.batchId.bookingDeadline < now) {
          booking.status = "CANCELLED";
          booking.cancelReason = "Booking deadline passed — auto-cancelled";
          booking.cancelledBy = "system";
          await booking.save();
          results.cancelled++;
        }
      } catch (e) {
        results.errors.push(`Auto-cancel ${booking.bookingId}: ${e.message}`);
      }
    }
  } catch (err) {
    results.errors.push(`Cron error: ${err.message}`);
  }

  return results;
}

// POST /api/admin/run-cron  — manual trigger (admin only)
exports.runCron = async (req, res) => {
  try {
    const results = await runCronJobs();
    res.json({
      success: true,
      message: `Cron complete. ${results.completed} completed, ${results.cancelled} cancelled.`,
      results,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Export for use in a scheduled job later
exports.runCronJobs = runCronJobs;
