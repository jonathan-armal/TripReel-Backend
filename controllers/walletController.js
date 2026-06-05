const OperatorWallet = require("../models/OperatorWallet");
const WalletTransaction = require("../models/WalletTransaction");

// ── Operator ──────────────────────────────────────────────────────────────────

// GET /api/wallet  — operator's own wallet summary
exports.getMyWallet = async (req, res) => {
  try {
    const wallet = await OperatorWallet.findOneAndUpdate(
      { operatorId: req.operator._id },
      { $setOnInsert: { operatorId: req.operator._id } },
      { upsert: true, new: true },
    );
    res.json({ success: true, wallet });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/wallet/transactions  — operator's transaction history
exports.getMyTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      WalletTransaction.find({ operatorId: req.operator._id })
        .populate("bookingId", "bookingId snapshot.packageTitle")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      WalletTransaction.countDocuments({ operatorId: req.operator._id }),
    ]);

    res.json({ success: true, total, page: Number(page), transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Admin ─────────────────────────────────────────────────────────────────────

// GET /api/wallet/admin/all  — all operator wallets
exports.adminGetAllWallets = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [wallets, total] = await Promise.all([
      OperatorWallet.find()
        .populate("operatorId", "businessName contactName email")
        .sort({ balance: -1 })
        .skip(skip)
        .limit(Number(limit)),
      OperatorWallet.countDocuments(),
    ]);

    res.json({ success: true, total, page: Number(page), wallets });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/wallet/admin/:operatorId  — admin views single operator wallet
exports.adminGetWallet = async (req, res) => {
  try {
    const wallet = await OperatorWallet.findOne({
      operatorId: req.params.operatorId,
    }).populate("operatorId", "businessName contactName email");

    if (!wallet) {
      return res.json({
        success: true,
        wallet: { balance: 0, totalEarned: 0, totalWithdrawn: 0 },
      });
    }

    const transactions = await WalletTransaction.find({
      operatorId: req.params.operatorId,
    })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ success: true, wallet, recentTransactions: transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
