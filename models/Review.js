const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // The trip or booking this review is for (to verify user actually took the trip)
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      default: null,
    },
    // New booking system references
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      default: null,
    },
    bookingRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TripBooking",
      default: null,
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    // Helpful for moderation
    isVisible: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// One review per booking (a user who books the same package multiple times
// can leave a separate review for each completed booking — all are averaged).
reviewSchema.index(
  { bookingRef: 1 },
  {
    unique: true,
    partialFilterExpression: { bookingRef: { $type: "objectId" } },
  },
);

module.exports = mongoose.model("Review", reviewSchema);
