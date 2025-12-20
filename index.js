import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.BINGX_API_KEY;
const SECRET_KEY = process.env.BINGX_SECRET_KEY;

const BASE_URL = "https://open-api.bingx.com";

// =========================
// SIGN HELPER
// =========================
function sign(queryString) {
  return crypto
    .createHmac("sha256", SECRET_KEY)
    .update(queryString)
    .digest("hex");
}

// =========================
// SEND REQUEST
// =========================
async function sendRequest(path, params) {
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

  const data = await res.json();
  return data;
}

// =========================
// WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {
  try {
    const {
      type,
      symbol,
      side,
      entry,
      sl,
      tp1,
      qty,
    } = req.body;

    if (type !== "entry_scalp") {
      return res.json({ ignored: true });
    }

    console.log("📩 ENTRY:", req.body);

    const positionSide = side === "BUY" ? "LONG" : "SHORT";
    const closeSide = side === "BUY" ? "SELL" : "BUY";

    // =========================
    // ENTRY (MARKET)
    // =========================
    const entryResult = await sendRequest(
      "/openApi/swap/v2/trade/order",
      {
        symbol,
        side,
        positionSide,
        type: "MARKET",
        quantity: qty,
      }
    );

    console.log("✅ ENTRY RESULT:", entryResult);

    if (entryResult.code !== 0) {
      return res.json({ entry_error: entryResult });
    }

    // =========================
    // STOP LOSS
    // =========================
    const slResult = await sendRequest(
      "/openApi/swap/v2/trade/order",
      {
        symbol,
        side: closeSide,
        positionSide,
        type: "STOP_MARKET",
        stopPrice: sl,
        quantity: qty,
        reduceOnly: true,
      }
    );

    console.log("🛑 SL RESULT:", slResult);

    // =========================
    // TAKE PROFIT (TP1)
    // =========================
    const tpResult = await sendRequest(
      "/openApi/swap/v2/trade/order",
      {
        symbol,
        side: closeSide,
        positionSide,
        type: "TAKE_PROFIT_MARKET",
        stopPrice: tp1,
        quantity: qty,
        reduceOnly: true,
      }
    );

    console.log("🎯 TP RESULT:", tpResult);

    res.json({
      ok: true,
      entry: entryResult,
      sl: slResult,
      tp: tpResult,
    });
  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// =========================
// HEALTH CHECK
// =========================
app.get("/", (req, res) => {
  res.send("BingX AutoBot running (Hedge Mode)");
});

app.listen(PORT, () => {
  console.log(`🚀 BingX AutoBot running on port ${PORT}`);
});
