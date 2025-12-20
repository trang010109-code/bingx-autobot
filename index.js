import express from "express";
import crypto from "crypto";
import axios from "axios";

const app = express();
app.use(express.json());

// ================== CONFIG ==================
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.BINGX_API_KEY;
const SECRET_KEY = process.env.BINGX_SECRET_KEY;
const BASE_URL = "https://open-api.bingx.com";

// ================== SIGN HELPER ==================
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

// ================== REQUEST HELPER ==================
async function bingxRequest(path, params) {
  const timestamp = Date.now();
  const payload = { ...params, timestamp };
  const signature = sign(payload);

  const url = `${BASE_URL}${path}?${new URLSearchParams({
    ...payload,
    signature,
  })}`;

  return axios.post(url, null, {
    headers: {
      "X-BX-APIKEY": API_KEY,
    },
  });
}

// ================== CORE LOGIC ==================
async function handleEntry(payload) {
  const { symbol, side, qty, sl, tp1 } = payload;

  const entrySide = side === "BUY" ? "BUY" : "SELL";
  const closeSide = side === "BUY" ? "SELL" : "BUY";

  console.log("▶ ENTRY:", payload);

  // 1️⃣ ENTRY MARKET
  await bingxRequest("/openApi/swap/v2/trade/order", {
    symbol,
    side: entrySide,
    positionSide: "BOTH",
    type: "MARKET",
    quantity: qty,
  });

  console.log("✅ ENTRY placed");

  // 2️⃣ STOP LOSS
  if (sl) {
    await bingxRequest("/openApi/swap/v2/trade/order", {
      symbol,
      side: closeSide,
      positionSide: "BOTH",
      type: "STOP_MARKET",
      stopPrice: sl,
      quantity: qty,
      reduceOnly: true,
    });
    console.log("🛑 SL placed");
  }

  // 3️⃣ TAKE PROFIT (TP1)
  if (tp1) {
    await bingxRequest("/openApi/swap/v2/trade/order", {
      symbol,
      side: closeSide,
      positionSide: "BOTH",
      type: "TAKE_PROFIT_MARKET",
      stopPrice: tp1,
      quantity: qty,
      reduceOnly: true,
    });
    console.log("🎯 TP1 placed");
  }
}

// ================== WEBHOOK ==================
app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;

    if (payload.type !== "entry_scalp") {
      return res.status(200).json({ msg: "Ignored" });
    }

    await handleEntry(payload);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("❌ ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: "Order failed" });
  }
});

// ================== HEALTH CHECK ==================
app.get("/", (req, res) => {
  res.send("BingX AutoBot running");
});

// ================== START ==================
app.listen(PORT, () => {
  console.log(`🚀 BingX AutoBot running on port ${PORT}`);
});
