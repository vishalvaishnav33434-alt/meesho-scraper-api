const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json({ limit: "1mb" }));

// Home route
app.get("/", (req, res) => {
  res.status(200).send("Meesho Scraper API is running");
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API is running"
  });
});

// Safe environment check
app.get("/debug-env", (req, res) => {
  res.status(200).json({
    status: "ok",
    scrapingBeeApiKeyConfigured:
      Boolean(process.env.SCRAPINGBEE_API_KEY),
    nodeEnvironment:
      process.env.NODE_ENV || "not set"
  });
});

// Meesho product scraper
app.get("/api/product", async (req, res) => {
  try {
    const url = req.query.url;
    const key = process.env.SCRAPINGBEE_API_KEY;

    if (!key) {
      return res.status(500).json({
        error: "SCRAPINGBEE_API_KEY is not configured"
      });
    }

    if (
      typeof url !== "string" ||
      !/^https:\/\/(www\.)?meesho\.com\//i.test(url)
    ) {
      return res.status(400).json({
        error: "Provide a valid HTTPS Meesho product URL"
      });
    }

    const response = await axios.get(
      "https://app.scrapingbee.com/api/v1/",
      {
        params: {
          api_key: key,
          url: url,
          render_js: "true"
        },
        timeout: 180000,
        responseType: "text",
        maxRedirects: 3
      }
    );

    const html = response.data;

    if (
      typeof html !== "string" ||
      !html.includes("__NEXT_DATA__")
    ) {
      return res.status(502).json({
        error: "Product page unavailable or scraping blocked"
      });
    }

    const blocks =
      html.match(
        /<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi
      ) || [];

    const products = [];

    function collectProducts(data) {
      if (!data || typeof data !== "object") return;

      if (Array.isArray(data)) {
        data.forEach(collectProducts);
        return;
      }

      const type = data["@type"];

      if (
        type === "Product" ||
        (Array.isArray(type) && type.includes("Product"))
      ) {
        products.push(data);
      }

      if (data["@graph"]) {
        collectProducts(data["@graph"]);
      }

      if (data.mainEntity) {
        collectProducts(data.mainEntity);
      }

      if (data.itemListElement) {
        collectProducts(data.itemListElement);
      }
    }

    for (const block of blocks) {
      const json = block
        .replace(/^<script[^>]*>/i, "")
        .replace(/<\/script>$/i, "");

      try {
        collectProducts(JSON.parse(json));
      } catch {
        // Ignore invalid JSON-LD blocks
      }
    }

    if (!products.length) {
      return res.status(404).json({
        error: "No structured product data found",
        message: "The product page may have changed its format"
      });
    }

    return res.status(200).json(products[0]);

  } catch (error) {
    console.error(
      "Product scraping failed:",
      error.response?.status || error.code || error.message
    );

    return res.status(502).json({
      error: "Scraping request failed",
      message:
        error.response?.status === 401 ||
        error.response?.status === 403
          ? "Check your ScrapingBee API credentials or permissions"
          : "The product page could not be retrieved"
    });
  }
});

// Start server
const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on port ${PORT}`);
});
