import express from "express";
import axios from "axios";
import crypto from "crypto";

const app = express();
app.use(express.json());

const API_KEY = process.env.BINGX_API_KEY;
const SECRET_KEY = process.env.BINGX_SECRET_KEY;

const BASE_URL = "https://open-api.bingx.com";

// ==============================
// SIGN HELPER
// ==============================
function sign(params) {
  const query = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join("&");

  const signature = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(query)
    .digest("hex");

  return `${query}&signature=${signature}`;
}

// ==============================
// PLACE ORDER (MARKET)
// ==============================
async function placeOrder({ symbol, side, qty }) {
  const timestamp = Date.now();

  const params = {
    symbol,
    side,              // BUY / SELL
    type: "MARKET",
    quantity: qty,
    timestamp
  };

  const signedQuery = sign(params);

  const url = `${BASE_URL}/openApi/swap/v2/trade/order?${signedQuery}`;

  const res = await axios.post(url, null, {
    headers: {
      "X-BX-APIKEY": API_KEY
    }
  });

  return res.data;
}

// ==============================
// HEALTH CHECK
// ==============================
app.get("/", (req, res) => {
  res.send("BingX AutoBot running");
});

// ==============================
// WEBHOOK (LIVE)
// ==============================
app.post("/webhook", async (req, res) => {
  try {
    const {
      type,
      symbol,
      side,
      qty
    } = req.body;

    console.log("LIVE ORDER RECEIVED:", req.body);

    if (type !== "entry_scalp") {
      return res.status(400).json({ error: "Invalid type" });
    }

    if (!["BUY", "SELL"].includes(side)) {
      return res.status(400).json({ error: "Invalid side" });
    }

    const result = await placeOrder({
      symbol,
      side,
      qty
    });

    console.log("ORDER RESULT:", result);

    res.json({ status: "ok", result });

  } catch (err) {
    console.error("ORDER ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: "order_failed" });
  }
});

// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("BingX AutoBot running on port", PORT);
});
