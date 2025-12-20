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

    if (type !== "entry_scalp") return res.json({ ignored: true });

    const symbol = "BTC-USDT-SWAP"; // ✅ FIX
    const positionSide = side === "BUY" ? "LONG" : "SHORT";
    const closeSide = side === "BUY" ? "SELL" : "BUY";

    console.log("📩 ALERT:", req.body);

    // =========================
    // ENTRY MARKET (NO PRICE)
    // =========================
    const entry = await send("/openApi/swap/v2/trade/order", {
      symbol,
      side,
      positionSide,
      type: "MARKET",
      quantity: qty,
    });

    console.log("✅ ENTRY:", entry);
    if (entry.code !== 0) return res.json({ entry_error: entry });

    // =========================
    // STOP LOSS (PLAN ORDER)
    // =========================
    const slOrder = await send("/openApi/swap/v1/plan/place", {
      symbol,
      side: closeSide,
      positionSide,
      type: "STOP_MARKET",
      stopPrice: sl,
      quantity: qty,
    });

    console.log("🛑 SL:", slOrder);

    // =========================
    // TAKE PROFIT (PLAN ORDER)
    // =========================
    const tpOrder = await send("/openApi/swap/v1/plan/place", {
      symbol,
      side: closeSide,
      positionSide,
      type: "TAKE_PROFIT_MARKET",
      stopPrice: tp1,
      quantity: qty,
    });

    console.log("🎯 TP1:", tpOrder);

    res.json({ ok: true, entry, slOrder, tpOrder });
  } catch (e) {
    console.error("❌ ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// =========================
app.get("/", (_, res) => res.send("BingX AutoBot Hedge Mode OK"));
app.listen(PORT, () => console.log("🚀 BingX Bot running on", PORT));
