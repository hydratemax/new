const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
app.use(cors());
app.use(express.json());

const BASE = "https://mangafire.to";

/* ─────────────────────────────
   HEADERS
───────────────────────────── */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Referer: "https://mangafire.to/",
};

/* ─────────────────────────────
   SIMPLE CACHE (speed boost)
───────────────────────────── */
const cache = new Map();
const getCache = (k) => cache.get(k);
const setCache = (k, v) => cache.set(k, v);

/* ─────────────────────────────
   AXIOS HELPER
───────────────────────────── */
async function fetch(url, params = {}) {
  return axios.get(url, {
    params,
    headers: HEADERS,
    timeout: 15000,
  });
}

/* ─────────────────────────────
   SEARCH
───────────────────────────── */
app.get("/search", async (req, res) => {
  try {
    const q = req.query.q || "";
    const key = "search:" + q;

    if (getCache(key)) return res.json(getCache(key));

    const r = await fetch(`${BASE}/filter`, { keyword: q });
    const $ = cheerio.load(r.data);

    const results = [];

    $(".original.card-lg .unit").each((_, el) => {
      const href = $(el).find("a.poster").attr("href") || "";
      const id = href.replace("/manga/", "").trim();
      if (!id) return;

      results.push({
        id,
        title:
          $(el).find(".info a").first().text().trim() || "Unknown",
        cover:
          $(el).find("img").attr("src") ||
          $(el).find("img").attr("data-src") ||
          "",
        latestChapter:
          $(el).find(".info .tick-item").first().text().trim() ||
          "",
      });
    });

    const out = { results };
    setCache(key, out);
    res.json(out);
  } catch (e) {
    res.json({ results: [] });
  }
});

/* ─────────────────────────────
   TRENDING
───────────────────────────── */
app.get("/trending", async (req, res) => {
  try {
    const key = "trending";
    if (getCache(key)) return res.json(getCache(key));

    const r = await fetch(`${BASE}/home`);
    const $ = cheerio.load(r.data);

    const results = [];

    $(".swiper-slide .unit, .manga-list .unit").each((_, el) => {
      const href = $(el).find("a.poster").attr("href") || "";
      const id = href.replace("/manga/", "").trim();
      if (!id || results.length >= 24) return;

      results.push({
        id,
        title:
          $(el).find(".info a").first().text().trim() || "Unknown",
        cover: $(el).find("img").attr("src") || "",
      });
    });

    const out = { results };
    setCache(key, out);
    res.json(out);
  } catch (e) {
    res.json({ results: [] });
  }
});

/* ─────────────────────────────
   MANGA DETAILS
───────────────────────────── */
app.get("/manga", async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.json({});

    const key = "manga:" + id;
    if (getCache(key)) return res.json(getCache(key));

    const r = await fetch(`${BASE}/manga/${encodeURIComponent(id)}`);
    const $ = cheerio.load(r.data);

    const data = {
      id,
      title: $("h1.name").text().trim() || "Unknown",
      cover:
        $(".poster img").attr("src") ||
        $(".manga-poster img").attr("src") ||
        "",
      description:
        $(".synopsis p").text().trim() || "",
      genres: [],
      status: $(".info .status").first().text().trim(),
      author: $(".info a[href*='author']").first().text().trim(),
    };

    $(".genres a, [class*='genre'] a").each((_, el) => {
      data.genres.push($(el).text().trim());
    });

    setCache(key, data);
    res.json(data);
  } catch (e) {
    res.json({});
  }
});

/* ─────────────────────────────
   CHAPTERS
───────────────────────────── */
app.get("/chapters", async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.json({ chapters: [] });

    const key = "chapters:" + id;
    if (getCache(key)) return res.json(getCache(key));

    const r = await fetch(`${BASE}/manga/${encodeURIComponent(id)}`);
    const $ = cheerio.load(r.data);

    const chapters = [];

    $("[id$='-chapters'] li, .chapter-list li, #en-chapters li").each(
      (_, el) => {
        const a = $(el).find("a");
        const href = a.attr("href") || "";
        if (!href) return;

        const chapterNum =
          href.match(/chapter-(\d+(\.\d+)?)/)?.[1] || "0";

        chapters.push({
          id: href.replace(/^\//, ""),
          chapter: chapterNum,
          title: a.text().trim(),
          date: $(el).find(".date, time").text().trim(),
        });
      }
    );

    // FIXED ORDER (important for reader)
    chapters.sort(
      (a, b) => parseFloat(a.chapter) - parseFloat(b.chapter)
    );

    const out = { chapters };
    setCache(key, out);
    res.json(out);
  } catch (e) {
    res.json({ chapters: [] });
  }
});

/* ─────────────────────────────
   PAGES
───────────────────────────── */
app.get("/pages", async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.json({ images: [] });

    const key = "pages:" + id;
    if (getCache(key)) return res.json(getCache(key));

    const r = await fetch(`${BASE}/${id}`);
    const $ = cheerio.load(r.data);

    const images = [];

    $(".page-break img, .reading-content img").each((_, el) => {
      const src =
        $(el).attr("src") ||
        $(el).attr("data-src") ||
        $(el).attr("data-lazy-src") ||
        "";

      if (src && src.startsWith("http")) {
        images.push(src);
      }
    });

    const out = { images };
    setCache(key, out);
    res.json(out);
  } catch (e) {
    res.json({ images: [] });
  }
});

/* ─────────────────────────────
   SAFE PROXY
───────────────────────────── */
app.get("/proxy", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || !url.startsWith("http"))
      return res.status(400).send("invalid url");

    const r = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: HEADERS,
    });

    res.set("Content-Type", r.headers["content-type"] || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(r.data);
  } catch {
    res.status(500).send("proxy error");
  }
});

/* ─────────────────────────────
   START
───────────────────────────── */
app.listen(process.env.PORT || 3000, () =>
  console.log("Server running on port", process.env.PORT || 3000)
);
