import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.BINGX_API_KEY;
const SECRET_KEY = process.env.BINGX_SECRET_KEY;

const BASE_URL = "https://open-api.bingx.com";

// =========================
// SIGN
// =========================
function sign(query) {
  return crypto
    .createHmac("sha256", SECRET_KEY)
    .update(query)
    .digest("hex");
}

// =========================
// SEND REQUEST
// =========================
async function send(path, params) {
  const timestamp = Date.now();
  const query = new URLSearchParams({
    ...params,
    timestamp,
    recvWindow: 5000,
  }).toString();

  const signature = sign(query);
  const url = `${BASE_URL}${path}?${query}&signature=${signature}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-BX-APIKEY": API_KEY,
      "Content-Type": "application/json",
    },
  });

  return await res.json();
}

// =========================
// WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {
  try {
    const { type, side, sl, tp1, qty } = req.body;
    if (type !== "entry_scalp") {
      return res.json({ ignored: true });
    }

    const symbol = "BTC-USDT"; // ✅ ĐÚNG DUY NHẤT
    const closeSide = side === "BUY" ? "SELL" : "BUY";

    console.log("📩 ENTRY:", req.body);

    // ========= ENTRY =========
    const entry = await send("/openApi/swap/v2/trade/order", {
      symbol,
      side,
      type: "MARKET",
      quantity: qty,
      marginType: "ISOLATED",
    });

    console.log("✅ ENTRY RESULT:", entry);
    if (entry.code !== 0) {
      return res.json({ entry_error: entry });
    }

    // ========= STOP LOSS =========
    const stopLoss = await send("/openApi/swap/v2/trade/order", {
      symbol,
      side: closeSide,
      type: "STOP_MARKET",
      stopPrice: sl,
      quantity: qty,
      reduceOnly: true,
      marginType: "ISOLATED",
    });

    console.log("🛑 SL RESULT:", stopLoss);

    // ========= TAKE PROFIT =========
    const takeProfit = await send("/openApi/swap/v2/trade/order", {
      symbol,
      side: closeSide,
      type: "TAKE_PROFIT_MARKET",
      stopPrice: tp1,
      quantity: qty,
      reduceOnly: true,
      marginType: "ISOLATED",
    });

    console.log("🎯 TP1 RESULT:", takeProfit);

    res.json({ ok: true, entry, stopLoss, takeProfit });
  } catch (e) {
    console.error("❌ ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// =========================
app.get("/", (_, res) => res.send("BingX AutoBot Swap V2 running"));
app.listen(PORT, () => {
  console.log(`🚀 BingX AutoBot running on port ${PORT}`);
});
