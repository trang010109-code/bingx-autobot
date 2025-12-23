import express from "express";
import crypto from "crypto";

/* =====================================================
   CONFIG
===================================================== */
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.BINGX_API_KEY;
const SECRET_KEY = process.env.BINGX_SECRET_KEY;

const BASE_URL = "https://open-api.bingx.com";

// FUTURES SYMBOL (QUAN TRỌNG)
const SYMBOL = "BTCUSDT";          // ✅ ĐÚNG cho BingX Futures
const MARGIN_TYPE = "ISOLATED";    // hoặc "CROSSED"

/* =====================================================
   SIGNATURE
===================================================== */
function sign(queryString) {
  return crypto
    .createHmac("sha256", SECRET_KEY)
    .update(queryString)
    .digest("hex");
}

/* =====================================================
   SEND REQUEST (POST – SWAP V2)
===================================================== */
async function sendOrder(path, params) {
  const timestamp = Date.now();

  // Query string để ký
  const query = new URLSearchParams({
    ...params,
    timestamp,
    recvWindow: 5000,
  }).toString();

  const signature = sign(query);

  const url = `${BASE_URL}${path}?${query}&signature=${signature}`;

  console.log("➡️ REQUEST:", url);

  const res = await fetch(url, {
    method: "POST", // ✅ BẮT BUỘC POST
    headers: {
      "X-BX-APIKEY": API_KEY,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  return data;
}

/* =====================================================
   WEBHOOK FROM TRADINGVIEW
===================================================== */
app.post("/webhook", async (req, res) => {
  try {
    const { type, side, sl, tp1, qty } = req.body;

    console.log("📩 ENTRY:", req.body);

    // Validate
    if (type !== "entry_scalp") {
      return res.json({ ignored: true });
    }
    if (!side || !qty) {
      return res.status(400).json({ error: "Missing side or qty" });
    }

    const closeSide = side === "BUY" ? "SELL" : "BUY";
    const ts = Date.now();

    /* =========================
       ENTRY — MARKET
    ========================= */
    const entry = await sendOrder("/openApi/swap/v2/trade/order", {
      symbol: SYMBOL,
      side,
      type: "MARKET",
      quantity: qty,
      marginType: MARGIN_TYPE,
      clientOrderId: `TV_ENTRY_${ts}`,
    });

    console.log("✅ ENTRY RESULT:", entry);

    if (entry.code !== 0) {
      console.error("❌ ENTRY FAILED");
      return res.json({ entry_error: entry });
    }

    /* =========================
       STOP LOSS
    ========================= */
    if (sl) {
      const stopLoss = await sendOrder("/openApi/swap/v2/trade/order", {
        symbol: SYMBOL,
        side: closeSide,
        type: "STOP_MARKET",
        stopPrice: sl,
        quantity: qty,
        reduceOnly: true,
        marginType: MARGIN_TYPE,
        clientOrderId: `TV_SL_${ts}`,
      });

      console.log("🛑 SL RESULT:", stopLoss);
    }

    /* =========================
       TAKE PROFIT (TP1)
    ========================= */
    if (tp1) {
      const takeProfit = await sendOrder("/openApi/swap/v2/trade/order", {
        symbol: SYMBOL,
        side: closeSide,
        type: "TAKE_PROFIT_MARKET",
        stopPrice: tp1,
        quantity: qty,
        reduceOnly: true,
        marginType: MARGIN_TYPE,
        clientOrderId: `TV_TP_${ts}`,
      });

      console.log("🎯 TP1 RESULT:", takeProfit);
    }

    res.json({ ok: true });

  } catch (err) {
    console.error("❌ SERVER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   HEALTH CHECK
===================================================== */
app.get("/", (_, res) => {
  res.send("🚀 BingX AutoBot Swap V2 is running");
});

/* =====================================================
   START SERVER
===================================================== */
app.listen(PORT, () => {
  console.log(`🚀 BingX AutoBot running on port ${PORT}`);
});
