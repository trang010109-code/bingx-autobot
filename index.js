import express from "express";
import crypto from "crypto";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.BINGX_API_KEY;
const SECRET_KEY = process.env.BINGX_SECRET_KEY;
const BASE_URL = "https://open-api.bingx.com";

// ===== SIGN =====
function sign(params) {
  const query = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join("&");

  return crypto
    .createHmac("sha256", SECRET_KEY)
    .update(query)
    .digest("hex");
}

// ===== REQUEST =====
async function bingxRequest(path, params) {
  const timestamp = Date.now();
  const payload = { ...params, timestamp };
  const signature = sign(payload);

  const url = `${BASE_URL}${path}?${new URLSearchParams({
    ...payload,
    signature,
  })}`;

  return axios.post(url, null, {
    headers: { "X-BX-APIKEY": API_KEY },
  });
}

// ===== CORE =====
async function handleEntry(payload) {
  const { symbol, side, qty, sl, tp1 } = payload;

  const entrySide = side === "BUY" ? "BUY" : "SELL";
  const positionSide = side === "BUY" ? "LONG" : "SHORT";
  const closeSide = side === "BUY" ? "SELL" : "BUY";

  console.log("▶ ENTRY PAYLOAD:", payload);

  // 1️⃣ ENTRY
  await bingxRequest("/openApi/swap/v2/trade/order", {
    symbol,
    side: entrySide,
    positionSide,
    type: "MARKET",
    quantity: qty,
  });
  console.log("✅ ENTRY OK");

  // 2️⃣ SL
  if (sl) {
    await bingxRequest("/openApi/swap/v2/trade/order", {
      symbol,
      side: closeSide,
      positionSide,
      type: "STOP_MARKET",
      stopPrice: sl,
      quantity: qty,
      reduceOnly: true,
    });
    console.log("🛑 SL OK");
  }

  // 3️⃣ TP1
  if (tp1) {
    await bingxRequest("/openApi/swap/v2/trade/order", {
      symbol,
      side: closeSide,
      positionSide,
      type: "TAKE_PROFIT_MARKET",
      stopPrice: tp1,
      quantity: qty,
      reduceOnly: true,
    });
    console.log("🎯 TP1 OK");
  }
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    if (req.body.type !== "entry_scalp") {
      return res.json({ ignored: true });
    }

    await handleEntry(req.body);
    res.json({ status: "ok" });
  } catch (e) {
    console.error("❌ ERROR:", e.response?.data || e.message);
    res.status(500).json({ error: "Order failed" });
  }
});

// ===== HEALTH =====
app.get("/", (_, res) => res.send("BingX AutoBot running"));

app.listen(PORT, () =>
  console.log(`🚀 BingX AutoBot running on port ${PORT}`)
);
