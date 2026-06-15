/**
 * Tests which key pair authenticates against the RazorpayX API.
 *   node scripts/testRzpAuth.js
 */
require("dotenv").config();

async function testAuth(label, id, secret) {
  if (!id || !secret) {
    console.log(`\n[${label}] missing id/secret — skipped`);
    return;
  }
  const auth = "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/contacts?count=1", {
    headers: { Authorization: auth },
  });
  const data = await res.json().catch(() => ({}));
  console.log(`\n[${label}] id=${id}`);
  console.log("  status:", res.status);
  console.log(
    "  result:",
    res.ok
      ? "✅ AUTH OK (can access RazorpayX)"
      : JSON.stringify(data.error || data),
  );
}

(async () => {
  await testAuth(
    "MAIN Razorpay keys",
    process.env.RAZORPAY_KEY_ID,
    process.env.RAZORPAY_KEY_SECRET,
  );
  await testAuth(
    "RAZORPAYX keys",
    process.env.RAZORPAYX_KEY_ID,
    process.env.RAZORPAYX_KEY_SECRET,
  );
})().catch((e) => console.error("FATAL:", e.message));
