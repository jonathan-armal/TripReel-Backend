const TripBooking = require("../models/TripBooking");
const Batch = require("../models/Batch");

// Helper: stagger notifications to avoid sending all at once
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const NOTIFICATION_STAGGER_MS = 500; // 500ms gap between each push notification

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

          const totalCredit =
            booking.pricing.operatorAmount + (booking.addonSurcharge || 0);

          const wallet = await OperatorWallet.findOneAndUpdate(
            { operatorId: booking.operatorId },
            {
              $inc: {
                balance: totalCredit,
                totalEarned: totalCredit,
              },
            },
            { upsert: true, new: true },
          );

          const surchargeNote =
            booking.addonSurcharge > 0
              ? ` (incl. ₹${booking.addonSurcharge} outside-city addon surcharge)`
              : "";

          await WalletTransaction.create({
            operatorId: booking.operatorId,
            bookingId: booking._id,
            type: "CREDIT",
            amount: totalCredit,
            description: `Booking ${booking.bookingId} — funds released after trip completion${surchargeNote}`,
            balanceAfter: wallet.balance,
          });

          results.walletReleased++;

          // Notify user: trip completed, rate it
          const { notifyUser } = require("./notificationController");
          const { notifyOperator } = require("./notificationController");
          const snap = booking.snapshot || {};
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "Trip Completed! ⭐",
            `Your trip to ${snap.packageTitle || "destination"} is complete. Rate your experience!`,
            { type: "trip_completed", bookingId: booking._id.toString() },
          );
          // Notify operator: wallet credited
          await delay(NOTIFICATION_STAGGER_MS);
          notifyOperator(
            booking.operatorId,
            "Wallet Credited 💰",
            `₹${totalCredit.toLocaleString("en-IN")} credited for booking ${booking.bookingId}.`,
            { type: "wallet_credited", bookingId: booking._id.toString() },
          );
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

  // ── Job 3: Trip countdown notifications (7d, 3d, 1d, today) ────────────
  try {
    const { notifyUser } = require("./notificationController");
    const confirmedForReminders = await TripBooking.find({
      status: "CONFIRMED",
    }).populate("batchId", "startDate");

    for (const booking of confirmedForReminders) {
      try {
        const startDate = booking.batchId?.startDate;
        if (!startDate) continue;

        const start = new Date(startDate);
        const todayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        const diffMs = start.getTime() - todayStart.getTime();
        const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const snap = booking.snapshot || {};
        const tripName = snap.packageTitle || "your destination";

        if (daysUntil === 7) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "1 Week to Go! \uD83C\uDF1F",
            `Your trip to ${tripName} is in 7 days! Time to start planning what to pack.`,
            {
              type: "trip_reminder",
              bookingId: booking._id.toString(),
              screen: "BookingDetails",
            },
          );
          results.reminders = (results.reminders || 0) + 1;
        } else if (daysUntil === 3) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "3 Days to Go! \uD83C\uDF92",
            `Your trip to ${tripName} is in 3 days! Pack your bags and get ready.`,
            {
              type: "trip_reminder",
              bookingId: booking._id.toString(),
              screen: "BookingDetails",
            },
          );
          results.reminders = (results.reminders || 0) + 1;
        } else if (daysUntil === 1) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "Trip Starts Tomorrow! \uD83C\uDF34",
            `Pack your bags! Your trip to ${tripName} starts tomorrow. Check your booking for details.`,
            {
              type: "trip_reminder",
              bookingId: booking._id.toString(),
              screen: "BookingDetails",
            },
          );
          // Send email reminder
          try {
            const User = require("../models/User");
            const user = await User.findById(booking.userId).select(
              "name email",
            );
            if (user?.email) {
              const { sendTripReminder } = require("../utils/sendMail");
              sendTripReminder({
                to: user.email,
                userName: user.name || "Traveler",
                tripDetails: {
                  packageName: tripName,
                  batchDate: snap.batchLabel || "",
                },
              });
            }
          } catch {}
          results.reminders = (results.reminders || 0) + 1;
        } else if (daysUntil === 0) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "Your Trip is TODAY! \uD83D\uDE80",
            `Today is the day! Your trip to ${tripName} starts today. Have an amazing journey!`,
            {
              type: "trip_reminder",
              bookingId: booking._id.toString(),
              screen: "BookingDetails",
            },
          );
          results.reminders = (results.reminders || 0) + 1;
        }
      } catch {}
    }
  } catch (err) {
    results.errors.push(`Reminder job: ${err.message}`);
  }

  // ── Job 4: Review reminders (Day 1, 2, 3 after trip completion) ──────────
  try {
    const { notifyUser } = require("./notificationController");
    const completedBookings = await TripBooking.find({
      status: "COMPLETED",
      hasReviewed: false,
    }).populate("batchId", "endDate");

    for (const booking of completedBookings) {
      try {
        const endDate = booking.batchId?.endDate;
        if (!endDate) continue;

        const end = new Date(endDate);
        const todayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        const diffMs = todayStart.getTime() - end.getTime();
        const daysSinceEnd = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const snap = booking.snapshot || {};
        const tripName = snap.packageTitle || "your trip";

        if (daysSinceEnd === 1) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "How was your trip? \u2B50",
            `Your trip to ${tripName} just ended! Share your experience and help other travelers.`,
            {
              type: "trip_completed",
              bookingId: booking._id.toString(),
              screen: "ReviewScreen",
            },
          );
          // Send review request email
          try {
            const User = require("../models/User");
            const user = await User.findById(booking.userId).select(
              "name email",
            );
            if (user?.email) {
              const { sendReviewRequest } = require("../utils/sendMail");
              sendReviewRequest({
                to: user.email,
                userName: user.name || "Traveler",
                tripDetails: { packageName: tripName },
              });
            }
          } catch {}
          results.reviewReminders = (results.reviewReminders || 0) + 1;
        } else if (daysSinceEnd === 2) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "We'd love your feedback! \uD83D\uDCDD",
            `Haven't reviewed your trip to ${tripName} yet? Your review helps other travelers make better choices.`,
            {
              type: "trip_completed",
              bookingId: booking._id.toString(),
              screen: "ReviewScreen",
            },
          );
          results.reviewReminders = (results.reviewReminders || 0) + 1;
        } else if (daysSinceEnd === 3) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "Last reminder: Rate your trip \uD83C\uDFC6",
            `Final reminder! Rate your experience at ${tripName}. It only takes 30 seconds.`,
            {
              type: "trip_completed",
              bookingId: booking._id.toString(),
              screen: "ReviewScreen",
            },
          );
          results.reviewReminders = (results.reviewReminders || 0) + 1;
        }
      } catch {}
    }
  } catch (err) {
    results.errors.push(`Review reminder job: ${err.message}`);
  }

  // ── Job 5: Wishlist urgency alerts (low seats, deadline tomorrow) ──────────
  try {
    const { notifyUser } = require("./notificationController");
    const Wishlist = require("../models/Wishlist");
    const Notification = require("../models/Notification");

    const wishlists = await Wishlist.find({}).populate("packages", "_id title");
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    for (const wishlist of wishlists) {
      const userId = wishlist.user;

      // Check how many alerts sent today (max 2 per user)
      const todayAlerts = await Notification.countDocuments({
        recipientId: userId,
        type: "offer",
        createdAt: { $gte: today },
      });
      if (todayAlerts >= 2) continue;

      for (const pkg of wishlist.packages || []) {
        if (todayAlerts >= 2) break;
        const packageId = pkg._id || pkg;
        const packageTitle = pkg.title || "a package you saved";

        // Find upcoming active batches for this package
        const upcomingBatches = await Batch.find({
          packageId,
          isActive: true,
          startDate: { $gt: now },
        });

        for (const batch of upcomingBatches) {
          if (todayAlerts >= 2) break;
          const seatsLeft = (batch.totalSeats || 0) - (batch.bookedSeats || 0);
          const deadlineDate = batch.bookingDeadline
            ? new Date(batch.bookingDeadline)
            : null;

          // Low seats alert (5 or fewer)
          if (seatsLeft > 0 && seatsLeft <= 5) {
            const alreadySent = await Notification.findOne({
              recipientId: userId,
              type: "offer",
              body: { $regex: `${seatsLeft} seat` },
              createdAt: { $gte: today },
            });
            if (!alreadySent) {
              notifyUser(
                userId,
                `Only ${seatsLeft} seats left!`,
                `${packageTitle} has only ${seatsLeft} seats remaining. Book now before it's full!`,
                {
                  type: "offer",
                  packageId: packageId.toString(),
                  screen: "PackageDetail",
                },
              );
              results.urgencyAlerts = (results.urgencyAlerts || 0) + 1;
              break;
            }
          }

          // Booking deadline tomorrow
          if (
            deadlineDate &&
            deadlineDate >= today &&
            deadlineDate < tomorrow
          ) {
            const alreadySent = await Notification.findOne({
              recipientId: userId,
              type: "offer",
              body: { $regex: "deadline" },
              createdAt: { $gte: today },
            });
            if (!alreadySent) {
              notifyUser(
                userId,
                "Booking deadline tomorrow!",
                `Last chance to book ${packageTitle}! Booking closes tomorrow.`,
                {
                  type: "offer",
                  packageId: packageId.toString(),
                  screen: "PackageDetail",
                },
              );
              results.urgencyAlerts = (results.urgencyAlerts || 0) + 1;
              break;
            }
          }
        }
      }
    }
  } catch (err) {
    results.errors.push(`Urgency alerts job: ${err.message}`);
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

// ── Split exports for separate scheduling ─────────────────────────────────────

// Job 1 + 2 only: auto-complete and auto-cancel (no push notifications)
exports.runAutoCompleteAndCancel = async function () {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const results = { completed: 0, cancelled: 0, walletReleased: 0, errors: [] };

  try {
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

          const OperatorWallet = require("../models/OperatorWallet");
          const WalletTransaction = require("../models/WalletTransaction");
          const totalCredit =
            booking.pricing.operatorAmount + (booking.addonSurcharge || 0);

          const wallet = await OperatorWallet.findOneAndUpdate(
            { operatorId: booking.operatorId },
            { $inc: { balance: totalCredit, totalEarned: totalCredit } },
            { upsert: true, new: true },
          );

          const surchargeNote =
            booking.addonSurcharge > 0
              ? ` (incl. ₹${booking.addonSurcharge} outside-city addon surcharge)`
              : "";

          await WalletTransaction.create({
            operatorId: booking.operatorId,
            bookingId: booking._id,
            type: "CREDIT",
            amount: totalCredit,
            description: `Booking ${booking.bookingId} — funds released after trip completion${surchargeNote}`,
            balanceAfter: wallet.balance,
          });
          results.walletReleased++;

          // Send push notifications for completion
          const {
            notifyUser,
            notifyOperator,
          } = require("./notificationController");
          const snap = booking.snapshot || {};
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "Trip Completed! ⭐",
            `Your trip to ${snap.packageTitle || "destination"} is complete. Rate your experience!`,
            { type: "trip_completed", bookingId: booking._id.toString() },
          );
          await delay(NOTIFICATION_STAGGER_MS);
          notifyOperator(
            booking.operatorId,
            "Wallet Credited 💰",
            `₹${totalCredit.toLocaleString("en-IN")} credited for booking ${booking.bookingId}.`,
            { type: "wallet_credited", bookingId: booking._id.toString() },
          );
        }
      } catch (e) {
        results.errors.push(`Auto-complete ${booking.bookingId}: ${e.message}`);
      }
    }

    // Auto-cancel expired pending bookings
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
    results.errors.push(`Auto-complete/cancel error: ${err.message}`);
  }
  return results;
};

// Job 3 only: trip countdown reminders (7d, 3d, 1d, today)
exports.runTripReminders = async function () {
  const now = new Date();
  const results = { reminders: 0, errors: [] };
  try {
    const { notifyUser } = require("./notificationController");
    const confirmedForReminders = await TripBooking.find({
      status: "CONFIRMED",
    }).populate("batchId", "startDate");

    for (const booking of confirmedForReminders) {
      try {
        const startDate = booking.batchId?.startDate;
        if (!startDate) continue;
        const start = new Date(startDate);
        const todayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        const diffMs = start.getTime() - todayStart.getTime();
        const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const snap = booking.snapshot || {};
        const tripName = snap.packageTitle || "your destination";

        if (daysUntil === 7) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "1 Week to Go! 🌟",
            `Your trip to ${tripName} is in 7 days! Time to start planning what to pack.`,
            {
              type: "trip_reminder",
              bookingId: booking._id.toString(),
              screen: "BookingDetails",
            },
          );
          results.reminders++;
        } else if (daysUntil === 3) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "3 Days to Go! 🎒",
            `Your trip to ${tripName} is in 3 days! Pack your bags and get ready.`,
            {
              type: "trip_reminder",
              bookingId: booking._id.toString(),
              screen: "BookingDetails",
            },
          );
          results.reminders++;
        } else if (daysUntil === 1) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "Trip Starts Tomorrow! 🌴",
            `Pack your bags! Your trip to ${tripName} starts tomorrow. Check your booking for details.`,
            {
              type: "trip_reminder",
              bookingId: booking._id.toString(),
              screen: "BookingDetails",
            },
          );
          results.reminders++;
          try {
            const User = require("../models/User");
            const user = await User.findById(booking.userId).select(
              "name email",
            );
            if (user?.email) {
              const { sendTripReminder } = require("../utils/sendMail");
              sendTripReminder({
                to: user.email,
                userName: user.name || "Traveler",
                tripDetails: {
                  packageName: tripName,
                  batchDate: snap.batchLabel || "",
                },
              });
            }
          } catch {}
        } else if (daysUntil === 0) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "Your Trip is TODAY! 🚀",
            `Today is the day! Your trip to ${tripName} starts today. Have an amazing journey!`,
            {
              type: "trip_reminder",
              bookingId: booking._id.toString(),
              screen: "BookingDetails",
            },
          );
          results.reminders++;
        }
      } catch {}
    }
  } catch (err) {
    results.errors.push(`Trip reminders error: ${err.message}`);
  }
  return results;
};

// Job 4 only: review reminders (day 1, 2, 3 after trip end)
exports.runReviewReminders = async function () {
  const now = new Date();
  const results = { reviewReminders: 0, errors: [] };
  try {
    const { notifyUser } = require("./notificationController");
    const completedBookings = await TripBooking.find({
      status: "COMPLETED",
      hasReviewed: false,
    }).populate("batchId", "endDate");

    for (const booking of completedBookings) {
      try {
        const endDate = booking.batchId?.endDate;
        if (!endDate) continue;
        const end = new Date(endDate);
        const todayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        const diffMs = todayStart.getTime() - end.getTime();
        const daysSinceEnd = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const snap = booking.snapshot || {};
        const tripName = snap.packageTitle || "your trip";

        if (daysSinceEnd === 1) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "How was your trip? ⭐",
            `Your trip to ${tripName} just ended! Share your experience and help other travelers.`,
            {
              type: "trip_completed",
              bookingId: booking._id.toString(),
              screen: "ReviewScreen",
            },
          );
          results.reviewReminders++;
          try {
            const User = require("../models/User");
            const user = await User.findById(booking.userId).select(
              "name email",
            );
            if (user?.email) {
              const { sendReviewRequest } = require("../utils/sendMail");
              sendReviewRequest({
                to: user.email,
                userName: user.name || "Traveler",
                tripDetails: { packageName: tripName },
              });
            }
          } catch {}
        } else if (daysSinceEnd === 2) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "We'd love your feedback! 📝",
            `Haven't reviewed your trip to ${tripName} yet? Your review helps other travelers make better choices.`,
            {
              type: "trip_completed",
              bookingId: booking._id.toString(),
              screen: "ReviewScreen",
            },
          );
          results.reviewReminders++;
        } else if (daysSinceEnd === 3) {
          await delay(NOTIFICATION_STAGGER_MS);
          notifyUser(
            booking.userId,
            "Last reminder: Rate your trip 🏆",
            `Final reminder! Rate your experience at ${tripName}. It only takes 30 seconds.`,
            {
              type: "trip_completed",
              bookingId: booking._id.toString(),
              screen: "ReviewScreen",
            },
          );
          results.reviewReminders++;
        }
      } catch {}
    }
  } catch (err) {
    results.errors.push(`Review reminders error: ${err.message}`);
  }
  return results;
};

// Job 5 only: wishlist urgency alerts
exports.runWishlistAlerts = async function () {
  const now = new Date();
  const results = { urgencyAlerts: 0, errors: [] };
  try {
    const { notifyUser } = require("./notificationController");
    const Wishlist = require("../models/Wishlist");
    const Notification = require("../models/Notification");

    const wishlists = await Wishlist.find({}).populate("packages", "_id title");
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    for (const wishlist of wishlists) {
      const userId = wishlist.user;
      const todayAlerts = await Notification.countDocuments({
        recipientId: userId,
        type: "offer",
        createdAt: { $gte: today },
      });
      if (todayAlerts >= 2) continue;

      for (const pkg of wishlist.packages || []) {
        if (todayAlerts >= 2) break;
        const packageId = pkg._id || pkg;
        const packageTitle = pkg.title || "a package you saved";
        const upcomingBatches = await Batch.find({
          packageId,
          isActive: true,
          startDate: { $gt: now },
        });

        for (const batch of upcomingBatches) {
          if (todayAlerts >= 2) break;
          const seatsLeft = (batch.totalSeats || 0) - (batch.bookedSeats || 0);
          const deadlineDate = batch.bookingDeadline
            ? new Date(batch.bookingDeadline)
            : null;

          if (seatsLeft > 0 && seatsLeft <= 5) {
            const alreadySent = await Notification.findOne({
              recipientId: userId,
              type: "offer",
              body: { $regex: `${seatsLeft} seat` },
              createdAt: { $gte: today },
            });
            if (!alreadySent) {
              await delay(NOTIFICATION_STAGGER_MS);
              notifyUser(
                userId,
                `Only ${seatsLeft} seats left!`,
                `${packageTitle} has only ${seatsLeft} seats remaining. Book now before it's full!`,
                {
                  type: "offer",
                  packageId: packageId.toString(),
                  screen: "PackageDetail",
                },
              );
              results.urgencyAlerts++;
              break;
            }
          }
          if (
            deadlineDate &&
            deadlineDate >= today &&
            deadlineDate < tomorrow
          ) {
            const alreadySent = await Notification.findOne({
              recipientId: userId,
              type: "offer",
              body: { $regex: "deadline" },
              createdAt: { $gte: today },
            });
            if (!alreadySent) {
              await delay(NOTIFICATION_STAGGER_MS);
              notifyUser(
                userId,
                "Booking deadline tomorrow!",
                `Last chance to book ${packageTitle}! Booking closes tomorrow.`,
                {
                  type: "offer",
                  packageId: packageId.toString(),
                  screen: "PackageDetail",
                },
              );
              results.urgencyAlerts++;
              break;
            }
          }
        }
      }
    }
  } catch (err) {
    results.errors.push(`Wishlist alerts error: ${err.message}`);
  }
  return results;
};
