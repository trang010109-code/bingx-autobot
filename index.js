import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

// =====================
// CONFIG
// =====================
const API_KEY = process.env.BINGX_API_KEY;
const SECRET_KEY = process.env.BINGX_SECRET_KEY;

const BASE_URL = "https://open-api.bingx.com";
const PORT = process.env.PORT || 3000;

// =====================
// SIGN HELPER
// =====================
function sign(queryString) {
  return crypto
    .createHmac("sha256", SECRET_KEY)
    .update(queryString)
    .digest("hex");
}

async function bingxRequest(method, path, params = {}) {
  const timestamp = Date.now();
  const query = new URLSearchParams({
    ...params,
    timestamp,
  }).toString();

  const signature = sign(query);
  const url = `${BASE_URL}${path}?${query}&signature=${signature}`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-BX-APIKEY": API_KEY,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  return data;
}

// =====================
// WEBHOOK
// =====================
app.post("/webhook", async (req, res) => {
  try {
    const { type, symbol, side, sl, tp1, qty } = req.body;

    console.log("▶ ENTRY:", req.body);

    if (type !== "entry_scalp") {
      return res.json({ ok: false, msg: "Invalid type" });
    }

    const positionSide = side === "BUY" ? "LONG" : "SHORT";
    const entrySide = side === "BUY" ? "BUY" : "SELL";
    const exitSide = side === "BUY" ? "SELL" : "BUY";

    // =====================
    // 1. ENTRY MARKET
    // =====================
    const entry = await bingxRequest("POST", "/openApi/swap/v2/trade/order", {
      symbol,
      side: entrySide,
      positionSide,
      type: "MARKET",
      quantity: qty,
    });
    console.log("✅ ENTRY OK", entry);

    // =====================
    // 2. STOP LOSS
    // =====================
    if (sl) {
      const slRes = await bingxRequest("POST", "/openApi/swap/v2/trade/order", {
        symbol,
        side: exitSide,
        positionSide,
        type: "STOP_MARKET",
        stopPrice: sl,
        quantity: qty,
        reduceOnly: true,
      });
      console.log("🛑 SL OK", slRes);
    }

    // =====================
    // 3. TAKE PROFIT (TP1)
    // =====================
    if (tp1) {
      const tpRes = await bingxRequest("POST", "/openApi/swap/v2/trade/order", {
        symbol,
        side: exitSide,
        positionSide,
        type: "TAKE_PROFIT_MARKET",
        stopPrice: tp1,
        quantity: qty,
        reduceOnly: true,
      });
      console.log("🎯 TP1 OK", tpRes);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================
// HEALTH CHECK
// =====================
app.get("/", (req, res) => {
  res.send("BingX AutoBot running");
});

app.listen(PORT, () => {
  console.log(`🚀 BingX AutoBot running on port ${PORT}`);
});
