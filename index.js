const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
res.send("Meesho Scraper API is running");
});

app.get("/health", (req, res) => {
res.json({ status: "ok" });
});

app.get("/api/product", async (req, res) => {
try {
const url = req.query.url;
const key = process.env.SCRAPINGBEE_API_KEY;

if (!key) {
  return res.status(500).json({ error: "API key is not configured" });
}

if (!url || !/^https:\/\/www\.meesho\.com\//.test(url)) {
  return res.status(400).json({ error: "Provide a valid Meesho product URL" });
}

const response = await axios.get(
  "https://app.scrapingbee.com/api/v1/",
  {
    headers: { Authorization: `Bearer ${key}` },
    params: { url, mode: "auto" },
    timeout: 180000
  }
);

const html = response.data;
if (typeof html !== "string" || !html.includes("__NEXT_DATA__")) {
  return res.status(502).json({
    error: "Product data unavailable or scraping blocked"
  });
}

const blocks = html.match(
  /<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g
) || [];

const products = [];

for (const block of blocks) {
  const json = block
    .replace(/^<script[^>]*>/, "")
    .replace(/<\/script>$/, "");

  try {
    const data = JSON.parse(json);
    if (data["@type"] === "Product") {
      products.push(data);
    }
  } catch {}
}

if (!products.length) {
  return res.status(404).json({ error: "No product data found" });
}

res.json(products[0]);

} catch (error) {
res.status(502).json({ error: "Scraping request failed" });
}
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
console.log("API listening on port ${PORT}");
});
