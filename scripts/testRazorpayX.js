/**
 * Diagnostic: exercises the RazorpayX payout API with the configured keys
 * so we can see the EXACT error the withdrawal flow hits.
 *
 *   node scripts/testRazorpayX.js
 */
require("dotenv").config();

const BASE = "https://api.razorpay.com/v1";

function authHeader() {
  const id = process.env.RAZORPAYX_KEY_ID;
  const secret = process.env.RAZORPAYX_KEY_SECRET;
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

async function call(path, body, idem) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: authHeader(),
  };
  if (idem) headers["X-Payout-Idempotency"] = idem;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

(async () => {
  console.log("KEY_ID:", process.env.RAZORPAYX_KEY_ID || "(missing)");
  console.log(
    "ACCOUNT_NUMBER:",
    JSON.stringify(process.env.RAZORPAYX_ACCOUNT_NUMBER) || "(missing)",
  );
  console.log("SECRET set:", !!process.env.RAZORPAYX_KEY_SECRET);
  console.log("─────────────────────────────────────────");

  // 1) Contact
  console.log("\n[1] Creating contact…");
  const c = await call("/contacts", {
    name: "Test Operator",
    type: "vendor",
    reference_id: "diag_" + Date.now(),
  });
  console.log("status", c.status, JSON.stringify(c.data, null, 2));
  if (!c.ok) return;

  // 2) Fund account (dummy bank)
  console.log("\n[2] Creating fund account…");
  const fa = await call("/fund_accounts", {
    contact_id: c.data.id,
    account_type: "bank_account",
    bank_account: {
      name: "Test Operator",
      ifsc: "HDFC0000001",
      account_number: "1111111111111",
    },
  });
  console.log("status", fa.status, JSON.stringify(fa.data, null, 2));
  if (!fa.ok) return;

  // 3) Payout (₹1)
  console.log("\n[3] Creating payout ₹1…");
  const ref = "diag_payout_" + Date.now();
  const p = await call(
    "/payouts",
    {
      account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER,
      fund_account_id: fa.data.id,
      amount: 100,
      currency: "INR",
      mode: "IMPS",
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: ref,
      narration: "TripReel diag",
    },
    ref,
  );
  console.log("status", p.status, JSON.stringify(p.data, null, 2));
})().catch((e) => console.error("FATAL:", e.message));
