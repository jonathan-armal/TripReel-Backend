const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema(
  {
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 1 },

    // Destination snapshot (for the audit trail / display)
    method: {
      type: String,
      enum: ["bank_account", "vpa"],
      default: "bank_account",
    },
    destination: { type: String, default: "" }, // masked acct or vpa

    // RazorpayX references
    payoutId: { type: String, default: "", index: true },
    fundAccountId: { type: String, default: "" },
    referenceId: { type: String, default: "", unique: true, sparse: true },

    // queued/pending/processing/processed/reversed/failed/cancelled
    status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "PROCESSED",
        "REVERSED",
        "FAILED",
        "CANCELLED",
      ],
      default: "PENDING",
    },
    failureReason: { type: String, default: "" },

    // True once the debited amount has been returned to the wallet (on fail/reversal)
    refunded: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Withdrawal", withdrawalSchema);
