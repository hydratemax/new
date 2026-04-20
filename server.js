const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
app.use(cors());
app.use(express.json());

const BASE = "https://mangafire.to";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "Referer": "https://mangafire.to/"
};

/* ─────────────────────────────
   SEARCH (ROBUST)
──────────────────────────── */
app.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").toLowerCase().trim();

    const r = await axios.get(`${BASE}/filter?keyword=${encodeURIComponent(q)}`, {
      headers: HEADERS,
      timeout: 15000
    });

    const $ = cheerio.load(r.data);
    const results = [];

    $(".unit").each((i, el) => {
      const a = $(el).find("a").first();
      const href = a.attr("href");
      if (!href || !href.includes("/manga/")) return;

      const title =
        $(el).find(".info a").first().text().trim() ||
        $(el).find("img").attr("alt") ||
        "";

      const img =
        $(el).find("img").attr("src") ||
        $(el).find("img").attr("data-src") ||
        "";

      const id = href.split("/manga/")[1]?.replace(/\/$/, "");
      if (!id || !title) return;

      results.push({ id, title, cover: img });
    });

    return res.json({ results });

  } catch (e) {
    console.log("SEARCH ERROR:", e.message);
    return res.json({ results: [] });
  }
});

/* ─────────────────────────────
   TRENDING
──────────────────────────── */
app.get("/trending", async (req, res) => {
  try {
    const r = await axios.get(`${BASE}/home`, { headers: HEADERS });

    const $ = cheerio.load(r.data);
    const results = [];

    $(".unit").each((i, el) => {
      const a = $(el).find("a").first();
      const href = a.attr("href");
      if (!href || !href.includes("/manga/")) return;

      const id = href.split("/manga/")[1]?.replace(/\/$/, "");

      const title =
        $(el).find(".info a").first().text().trim() ||
        "Unknown";

      const img =
        $(el).find("img").attr("src") ||
        "";

      results.push({ id, title, cover: img });
    });

    res.json({ results: results.slice(0, 20) });

  } catch (e) {
    res.status(500).json({ error: "trending failed" });
  }
});

/* ─────────────────────────────
   MANGA DETAILS
──────────────────────────── */
app.get("/manga", async (req, res) => {
  try {
    const id = req.query.id;

    const r = await axios.get(`${BASE}/manga/${id}`, {
      headers: HEADERS
    });

    const $ = cheerio.load(r.data);

    res.json({
      title: $("h1").first().text().trim(),
      cover: $(".poster img").attr("src") || "",
      description: $(".synopsis").text().trim()
    });

  } catch (e) {
    res.status(500).json({ error: "manga failed" });
  }
});

/* ─────────────────────────────
   CHAPTERS
──────────────────────────── */
app.get("/chapters", async (req, res) => {
  try {
    const id = req.query.id;

    const r = await axios.get(`${BASE}/manga/${id}`, {
      headers: HEADERS
    });

    const $ = cheerio.load(r.data);

    const chapters = [];

    $(".chapter-list li, [id$='-chapters'] li").each((i, el) => {
      const a = $(el).find("a");
      const href = a.attr("href");
      if (!href) return;

      chapters.push({
        id: href.replace("/", ""),
        title: a.text().trim()
      });
    });

    res.json({ chapters: chapters.reverse() });

  } catch (e) {
    res.status(500).json({ error: "chapters failed" });
  }
});

/* ─────────────────────────────
   PAGES
──────────────────────────── */
app.get("/pages", async (req, res) => {
  try {
    const id = req.query.id;

    const r = await axios.get(`${BASE}/${id}`, {
      headers: HEADERS
    });

    const $ = cheerio.load(r.data);

    const images = [];

    $("img").each((i, el) => {
      const src = $(el).attr("src");
      if (src && src.startsWith("http")) images.push(src);
    });

    res.json({ images });

  } catch (e) {
    res.status(500).json({ error: "pages failed" });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);
