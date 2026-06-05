const mongoose = require("mongoose");

const operatorWalletSchema = new mongoose.Schema(
  {
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      unique: true,
      index: true,
    },
    // Current available balance
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Lifetime totals (for reporting)
    totalEarned: {
      type: Number,
      default: 0,
    },
    totalWithdrawn: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("OperatorWallet", operatorWalletSchema);
