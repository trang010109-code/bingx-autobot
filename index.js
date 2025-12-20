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
// SEND REQUEST (BINGX)
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
    method: "GET", // BingX Swap V2 yêu cầu GET
    headers: {
      "X-BX-APIKEY": API_KEY,
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

    const symbol = "BTC-USDT";
    const closeSide = side === "BUY" ? "SELL" : "BUY";
    const ts = Date.now();

    console.log("📩 ENTRY:", req.body);

    // =========================
    // ENTRY (MARKET)
    // =========================
    const entry = await send("/openApi/swap/v2/trade/order", {
      symbol,
      side,
      type: "MARKET",
      quantity: qty,
      marginType: "ISOLATED",          // đổi CROSSED nếu muốn Cross
      clientOrderId: `TV_ENTRY_${ts}` // 🔥 BẮT BUỘC
    });

    console.log("✅ ENTRY RESULT:", entry);
    if (entry.code !== 0) {
      return res.json({ entry_error: entry });
    }

    // =========================
    // STOP LOSS
    // =========================
    const stopLoss = await send("/openApi/swap/v2/trade/order", {
      symbol,
      side: closeSide,
      type: "STOP_MARKET",
      stopPrice: sl,
      quantity: qty,
      reduceOnly: true,
      marginType: "ISOLATED",
      clientOrderId: `TV_SL_${ts}`    // 🔥 BẮT BUỘC
    });

    console.log("🛑 SL RESULT:", stopLoss);

    // =========================
    // TAKE PROFIT (TP1)
    // =========================
    const takeProfit = await send("/openApi/swap/v2/trade/order", {
      symbol,
      side: closeSide,
      type: "TAKE_PROFIT_MARKET",
      stopPrice: tp1,
      quantity: qty,
      reduceOnly: true,
      marginType: "ISOLATED",
      clientOrderId: `TV_TP_${ts}`    // 🔥 BẮT BUỘC
    });

    console.log("🎯 TP1 RESULT:", takeProfit);

    res.json({ ok: true, entry, stopLoss, takeProfit });

  } catch (e) {
    console.error("❌ ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// =========================
// HEALTH CHECK
// =========================
app.get("/", (_, res) => res.send("BingX AutoBot Swap V2 running"));

app.listen(PORT, () => {
  console.log(`🚀 BingX AutoBot running on port ${PORT}`);
});
