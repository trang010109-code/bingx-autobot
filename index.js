import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// =========================
// ENV
// =========================
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.BINGX_API_KEY;
const SECRET_KEY = process.env.BINGX_SECRET_KEY;
const BASE_URL = "https://open-api.bingx.com";

// =========================
// SIGN FUNCTION
// =========================
function sign(query) {
  return crypto
    .createHmac("sha256", SECRET_KEY)
    .update(query)
    .digest("hex");
}

// =========================
// SEND ORDER (POST - BẮT BUỘC)
// =========================
async function sendOrder(path, params) {
  const timestamp = Date.now();

  const query = new URLSearchParams({
    ...params,
    timestamp,
    recvWindow: 5000,
  }).toString();

  const signature = sign(query);
  const url = `${BASE_URL}${path}?${query}&signature=${signature}`;

  console.log("➡️ REQUEST:", url);

  const res = await fetch(url, {
    method: "POST", // 🔥 BẮT BUỘC POST
    headers: {
      "X-BX-APIKEY": API_KEY,
      "Content-Type": "application/json",
    },
  });

  const json = await res.json();
  return json;
}

// =========================
// WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {
  try {
    const { type, side, sl, tp1, qty } = req.body;

    console.log("📩 ENTRY:", req.body);

    if (type !== "entry_scalp") {
      console.log("⏭️ IGNORE: not entry_scalp");
      return res.json({ ignored: true });
    }

    if (!side || !qty) {
      console.log("❌ INVALID PAYLOAD");
      return res.status(400).json({ error: "Invalid payload" });
    }

    // =========================
    // CONFIG
    // =========================
    const symbol = "BTC-USDT";
    const closeSide = side === "BUY" ? "SELL" : "BUY";
    const ts = Date.now();

    // =========================
    // ENTRY ORDER (MARKET)
    // =========================
    const entry = await sendOrder("/openApi/swap/v2/trade/order", {
      symbol,
      side,
      type: "MARKET",
      quantity: qty,
      marginType: "ISOLATED", // đổi CROSSED nếu muốn
      clientOrderId: `TV_ENTRY_${ts}`,
    });

    console.log("✅ ENTRY RESULT:", entry);

    if (entry.code !== 0) {
      console.log("❌ ENTRY FAILED");
      return res.json({ entry_error: entry });
    }

    // =========================
    // STOP LOSS
    // =========================
    if (sl) {
      const stopLoss = await sendOrder("/openApi/swap/v2/trade/order", {
        symbol,
        side: closeSide,
        type: "STOP_MARKET",
        stopPrice: sl,
        quantity: qty,
        reduceOnly: true,
        marginType: "ISOLATED",
        clientOrderId: `TV_SL_${ts}`,
      });

      console.log("🛑 SL RESULT:", stopLoss);
    }

    // =========================
    // TAKE PROFIT (TP1)
    // =========================
    if (tp1) {
      const takeProfit = await sendOrder("/openApi/swap/v2/trade/order", {
        symbol,
        side: closeSide,
        type: "TAKE_PROFIT_MARKET",
        stopPrice: tp1,
        quantity: qty,
        reduceOnly: true,
        marginType: "ISOLATED",
        clientOrderId: `TV_TP_${ts}`,
      });

      console.log("🎯 TP RESULT:", takeProfit);
    }

    return res.json({ ok: true });

  } catch (e) {
    console.error("❌ SERVER ERROR:", e);
    return res.status(500).json({ error: e.message });
  }
});

// =========================
// HEALTH CHECK
// =========================
app.get("/", (_, res) => {
  res.send("🚀 BingX AutoBot Swap V2 running");
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`🚀 BingX AutoBot running on port ${PORT}`);
});
