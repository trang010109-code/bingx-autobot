import express from "express";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("BingX AutoBot running");
});

app.post("/webhook", (req, res) => {
  console.log("WEBHOOK RECEIVED:", req.body);
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("BingX AutoBot running on port", PORT);
});
