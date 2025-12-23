import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.BINGX_API_KEY;
const SECRET_KEY = process.env.BINGX_SECRET_KEY;

const BASE_URL = "https://open-api.bingx.com";

const SYMBOL = "BTCUSDT";
const MARGIN_TYPE = "ISOLATED";
const CONTRACT_SIZE = 0.001; // 1 contract = 0.001 BTC

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
// SEND REQUEST (POST)
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

  console.log("➡️ REQUEST:", url);

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
    console.log("📩 ENTRY:", req.body);

    if (type !== "entry_scalp") {
      return res.json({ ignored: true });
    }

    // Convert BTC → CONTRACT
    const contracts = Math.max(1, Math.round(qty / CONTRACT_SIZE));

    const positionSide = side === "BUY" ? "LONG" : "SHORT";
    const closeSide = side === "BUY" ? "SELL" : "BUY";
    const closePositionSide = positionSide === "LONG" ? "SHORT" : "LONG";

    const ts = Date.now();

    // =========================
    // ENTRY
    // =========================
    const entry = await send("/openApi/swap/v2/trade/order", {
      symbol: SYMBOL,
      side,
      positionSide,
      type: "MARKET",
      quantity: contracts,
      marginType: MARGIN_TYPE,
      clientOrderId: `TV_ENTRY_${ts}`,
    });

    console.log("✅ ENTRY RESULT:", entry);

    if (entry.code !== 0) {
      console.error("❌ ENTRY FAILED");
      return res.json({ entry_error: entry });
    }

    // =========================
    // STOP LOSS
    // =========================
    if (sl) {
      const stopLoss = await send("/openApi/swap/v2/trade/order", {
        symbol: SYMBOL,
        side: closeSide,
        positionSide: closePositionSide,
        type: "STOP_MARKET",
        stopPrice: sl,
        quantity: contracts,
        reduceOnly: true,
        marginType: MARGIN_TYPE,
        clientOrderId: `TV_SL_${ts}`,
      });
      console.log("🛑 SL RESULT:", stopLoss);
    }

    // =========================
    // TAKE PROFIT
    // =========================
    if (tp1) {
      const takeProfit = await send("/openApi/swap/v2/trade/order", {
        symbol: SYMBOL,
        side: closeSide,
        positionSide: closePositionSide,
        type: "TAKE_PROFIT_MARKET",
        stopPrice: tp1,
        quantity: contracts,
        reduceOnly: true,
        marginType: MARGIN_TYPE,
        clientOrderId: `TV_TP_${ts}`,
      });
      console.log("🎯 TP RESULT:", takeProfit);
    }

    res.json({ ok: true });

  } catch (e) {
    console.error("❌ SERVER ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// =========================
// HEALTH
// =========================
app.get("/", (_, res) => {
  res.send("🚀 BingX Swap AutoBot is running");
});

app.listen(PORT, () => {
  console.log(`🚀 BingX AutoBot running on port ${PORT}`);
});
