import express from "express";
import crypto from "crypto";

// =========================
// APP SETUP
// =========================
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// =========================
// ENV
// =========================
const API_KEY = process.env.BINGX_API_KEY;
const SECRET_KEY = process.env.BINGX_SECRET_KEY;

if (!API_KEY || !SECRET_KEY) {
  console.error("❌ Missing BINGX_API_KEY or BINGX_SECRET_KEY");
  process.exit(1);
}

// =========================
// CONSTANTS
// =========================
const BASE_URL = "https://open-api.bingx.com";
const SYMBOL = "BTCUSDT";        // Futures BTCUSDT
const MARGIN_TYPE = "ISOLATED";
const LEVERAGE = 50;             // 🔥 SET 50x TẠI ĐÂY
const CONTRACT_SIZE = 1000;      // 1 contract = 0.001 BTC

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
// SEND REQUEST (GET – Swap V2)
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
    method: "GET", // 🔴 Swap V2 dùng GET
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

    console.log("📩 ENTRY:", req.body);

    if (!["BUY", "SELL"].includes(side)) {
      return res.status(400).json({ error: "Invalid side" });
    }

    if (!qty || qty <= 0) {
      return res.status(400).json({ error: "Invalid qty" });
    }

    // =========================
    // POSITION SIDE
    // =========================
    const positionSide = side === "BUY" ? "LONG" : "SHORT";
    const closeSide = side === "BUY" ? "SELL" : "BUY";

    // =========================
    // QTY → CONTRACTS
    // 0.01 BTC → 10 contracts
    // =========================
    const contracts = Math.round(qty * CONTRACT_SIZE);
    if (contracts <= 0) {
      return res.status(400).json({ error: "Qty too small after convert" });
    }

    const ts = Date.now();

    // =========================
    // ENTRY (MARKET)
    // =========================
    const entry = await send("/openApi/swap/v2/trade/order", {
      symbol: SYMBOL,
      side,
      positionSide,
      type: "MARKET",
      quantity: contracts,
      leverage: LEVERAGE,          // 🔥 BẮT BUỘC
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
        positionSide,
        type: "STOP_MARKET",
        stopPrice: sl,
        quantity: contracts,
        reduceOnly: true,
        leverage: LEVERAGE,
        marginType: MARGIN_TYPE,
        clientOrderId: `TV_SL_${ts}`,
      });

      console.log("🛑 SL RESULT:", stopLoss);
    }

    // =========================
    // TAKE PROFIT (TP1)
    // =========================
    if (tp1) {
      const takeProfit = await send("/openApi/swap/v2/trade/order", {
        symbol: SYMBOL,
        side: closeSide,
        positionSide,
        type: "TAKE_PROFIT_MARKET",
        stopPrice: tp1,
        quantity: contracts,
        reduceOnly: true,
        leverage: LEVERAGE,
        marginType: MARGIN_TYPE,
        clientOrderId: `TV_TP1_${ts}`,
      });

      console.log("🎯 TP1 RESULT:", takeProfit);
    }

    res.json({ ok: true });

  } catch (e) {
    console.error("❌ SERVER ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// =========================
// HEALTH CHECK
// =========================
app.get("/", (_, res) => {
  res.send("🚀 BingX AutoBot Swap V2 running (50x)");
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log(`🚀 BingX AutoBot running on port ${PORT}`);
});
