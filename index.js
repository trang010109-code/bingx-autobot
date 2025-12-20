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
  return crypto.createHmac("sha256", SECRET_KEY).update(query).digest("hex");
}

// =========================
// REQUEST
// =========================
async function send(path, params) {
  const timestamp = Date.now();
  const query = new URLSearchParams({ ...params, timestamp }).toString();
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

    const symbol = "BTC-USDT-SWAP";
    const positionSide = side === "BUY" ? "LONG" : "SHORT";
    const closeSide = side === "BUY" ? "SELL" : "BUY";

    console.log("📩 ENTRY:", req.body);

    // =========================
    // ENTRY (MARKET)
    // =========================
    const entry = await send("/openApi/swap/v2/trade/order", {
      symbol,
      side,
      positionSide,
      type: "MARKET",
      quantity: qty,
      marginMode: "ISOLATED",     // ✅ BẮT BUỘC
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
      positionSide,
      type: "STOP_MARKET",
      stopPrice: sl,
      quantity: qty,
      reduceOnly: true,           // ✅ BẮT BUỘC
      marginMode: "ISOLATED",
    });

    console.log("🛑 SL RESULT:", stopLoss);

    // =========================
    // TAKE PROFIT (TP1)
    // =========================
    const takeProfit = await send("/openApi/swap/v2/trade/order", {
      symbol,
      side: closeSide,
      positionSide,
      type: "TAKE_PROFIT_MARKET",
      stopPrice: tp1,
      quantity: qty,
      reduceOnly: true,           // ✅ BẮT BUỘC
      marginMode: "ISOLATED",
    });

    console.log("🎯 TP1 RESULT:", takeProfit);

    res.json({
      ok: true,
      entry,
      stopLoss,
      takeProfit,
    });

  } catch (e) {
    console.error("❌ ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// =========================
app.get("/", (_, res) => res.send("BingX AutoBot Hedge Mode RUNNING"));
app.listen(PORT, () => console.log("🚀 BingX Bot running on port", PORT));
