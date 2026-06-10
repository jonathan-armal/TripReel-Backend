const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const http = require("http");

dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize WebSocket
const { initSocket } = require("./config/socket");
initSocket(server);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Static folder for uploaded images and videos
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/profile", require("./routes/profileRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/upload", require("./routes/uploadRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/banners", require("./routes/bannerRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));
app.use("/api/packages", require("./routes/packageRoutes"));
app.use("/api/templates", require("./routes/templateRoutes"));
app.use("/api/listings", require("./routes/listingRoutes"));
app.use(
  "/api/popular-destinations",
  require("./routes/popularDestinationRoutes"),
);
app.use("/api/experiences", require("./routes/experienceRoutes"));
app.use("/api/trips", require("./routes/tripRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/wishlists", require("./routes/wishlistRoutes"));
app.use("/api/reels", require("./routes/reelRoutes"));
app.use("/api/operators/auth", require("./routes/operatorAuthRoutes"));
app.use("/api/operators", require("./routes/operatorRoutes"));

// ── New booking system (Phase 1) ──────────────────────────────────────────────
app.use("/api/batches", require("./routes/batchRoutes"));
app.use("/api/trip-bookings", require("./routes/tripBookingRoutes"));
app.use("/api/operator-bookings", require("./routes/operatorBookingRoutes"));
app.use("/api/settings", require("./routes/platformSettingsRoutes"));
app.use("/api/wallet", require("./routes/walletRoutes"));
app.use("/api/cron", require("./routes/cronRoutes"));
app.use("/api/coupons", require("./routes/couponRoutes"));
app.use("/api/admin/revenue", require("./routes/revenueRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/sidebar-counts", require("./routes/sidebarCountsRoutes"));
app.use("/api/campaigns", require("./routes/campaignRoutes"));
app.use("/api/app-screens", require("./routes/appScreenRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ message: "TripReel API is running", status: "OK" });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// ── MongoDB connection + server start ─────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.mongodburl;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    server.listen(PORT, () =>
      console.log(`🚀 Server running on port ${PORT} (WebSocket enabled)`),
    );

    // ── Schedule cron jobs ─────────────────────────────────────────────────
    const cron = require("node-cron");
    const {
      runAutoCompleteAndCancel,
      runTripReminders,
      runReviewReminders,
      runWishlistAlerts,
      runCronJobs,
    } = require("./controllers/cronController");

    // 12:00 AM (Midnight) — Auto-complete trips + auto-cancel expired bookings + wallet credits
    cron.schedule("0 0 * * *", async () => {
      try {
        const result = await runAutoCompleteAndCancel();
        console.log(
          `✅ Cron (midnight): ${result.completed} completed, ${result.cancelled} cancelled, ${result.walletReleased} wallets credited`,
        );
      } catch (err) {
        console.error("❌ Cron midnight error:", err.message);
      }
    });

    // 9:00 AM — Trip countdown reminders (7d, 3d, 1d, today)
    cron.schedule("0 9 * * *", async () => {
      try {
        const result = await runTripReminders();
        console.log(`✅ Cron (9AM): ${result.reminders} trip reminders sent`);
      } catch (err) {
        console.error("❌ Cron 9AM error:", err.message);
      }
    });

    // 11:00 AM — Review reminders (day 1, 2, 3 after trip end)
    cron.schedule("0 11 * * *", async () => {
      try {
        const result = await runReviewReminders();
        console.log(
          `✅ Cron (11AM): ${result.reviewReminders} review reminders sent`,
        );
      } catch (err) {
        console.error("❌ Cron 11AM error:", err.message);
      }
    });

    // 6:00 PM — Wishlist urgency alerts (low seats, deadline tomorrow)
    cron.schedule("0 18 * * *", async () => {
      try {
        const result = await runWishlistAlerts();
        console.log(
          `✅ Cron (6PM): ${result.urgencyAlerts} wishlist alerts sent`,
        );
      } catch (err) {
        console.error("❌ Cron 6PM error:", err.message);
      }
    });

    console.log("⏰ Cron jobs scheduled: midnight, 9AM, 11AM, 6PM");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });
