const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
app.use(cors());
app.use(express.json());

// Rotate user agents to avoid blocks
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
];
const ua = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

async function fetchHTML(url) {
  const res = await axios.get(url, {
    timeout: 20000,
    headers: {
      "User-Agent": ua(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Referer": "https://manganato.com/",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "upgrade-insecure-requests": "1",
    },
  });
  return res.data;
}

/* ── DEBUG: see raw HTML from MangaNato ──────────────────
   GET /debug?url=https://manganato.com/genre-all
   This shows you exactly what the server gets back.
   Check this FIRST if results are empty.
──────────────────────────────────────────────────── */
app.get("/debug", async (req, res) => {
  try {
    const url = req.query.url || "https://manganato.com/genre-all";
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    // Show first 3000 chars of body + all class names found
    const bodyText = $("body").html()?.slice(0, 3000) || "no body";
    const classes = new Set();
    $("[class]").each((_, el) => {
      ($(el).attr("class") || "").split(/\s+/).forEach(c => c && classes.add(c));
    });
    res.json({
      url,
      status: "fetched",
      title: $("title").text(),
      classesFound: [...classes].slice(0, 80),
      bodyPreview: bodyText,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── HEALTH CHECK ── */
app.get("/", (_, res) => res.json({ status: "ok", source: "manganato.com" }));

/* ── LATEST ──────────────────────────────────────────────
   Tries multiple selectors — first one that finds items wins
──────────────────────────────────────────────────────── */
app.get("/latest", async (req, res) => {
  try {
    const html = await fetchHTML("https://manganato.com/genre-all");
    const $ = cheerio.load(html);
    const results = [];

    // Selector set A — classic manganato layout
    $("div.content-genres-item").each((_, el) => {
      const img = $(el).find("img").attr("src") || $(el).find("img").attr("data-src") || "";
      const a = $(el).find("h3 a, h2 a, .genres-item-name a").first();
      const title = a.text().trim();
      const url = a.attr("href") || "";
      const chap = $(el).find("a.genres-item-chap, a[href*='chapter']").first().text().trim();
      const id = url.split("/").filter(Boolean).pop() || "";
      if (id && title) results.push({ id, title, cover: img, url, latestCh: chap });
    });

    // Selector set B — story_item layout
    if (!results.length) {
      $("div.story_item, div.story-item, li.story_item").each((_, el) => {
        const img = $(el).find("img").attr("src") || $(el).find("img").attr("data-src") || "";
        const a = $(el).find("h3 a, h2 a, .story_name a").first();
        const title = a.text().trim();
        const url = a.attr("href") || "";
        const chap = $(el).find("a[href*='chapter']").first().text().trim();
        const id = url.split("/").filter(Boolean).pop() || "";
        if (id && title) results.push({ id, title, cover: img, url, latestCh: chap });
      });
    }

    // Selector set C — any manga card with cover + title link
    if (!results.length) {
      $("div[class*='item'], li[class*='item']").each((_, el) => {
        const img = $(el).find("img").attr("src") || $(el).find("img").attr("data-src") || "";
        const a = $(el).find("a[href*='manga']").first();
        const title = a.attr("title") || a.text().trim();
        const url = a.attr("href") || "";
        const id = url.split("/").filter(Boolean).pop() || "";
        if (id && title && img) results.push({ id, title, cover: img, url, latestCh: "" });
      });
    }

    console.log(`/latest → ${results.length} results`);
    res.json({ results: results.slice(0, 24) });
  } catch (e) {
    console.error("/latest error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ── SEARCH ───────────────────────────────────────────── */
app.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim().replace(/\s+/g, "_").replace(/[!,?~|()']/g, "");
    const html = await fetchHTML(`https://manganato.com/search/story/${encodeURIComponent(q)}`);
    const $ = cheerio.load(html);
    const results = [];

    // Selector A
    $("div.search-story-item").each((_, el) => {
      const img = $(el).find("img").attr("src") || $(el).find("img").attr("data-src") || "";
      const a = $(el).find("div.item-right h3 a, h3 a, h2 a").first();
      const title = a.text().trim();
      const url = a.attr("href") || "";
      const chap = $(el).find("a.item-chapter, a[href*='chapter']").first().text().trim();
      const id = url.split("/").filter(Boolean).pop() || "";
      if (id && title) results.push({ id, title, cover: img, url, latestCh: chap });
    });

    // Selector B
    if (!results.length) {
      $("div.story_item, div.story-item").each((_, el) => {
        const img = $(el).find("img").attr("src") || $(el).find("img").attr("data-src") || "";
        const a = $(el).find("h3 a, h2 a").first();
        const title = a.text().trim();
        const url = a.attr("href") || "";
        const id = url.split("/").filter(Boolean).pop() || "";
        if (id && title) results.push({ id, title, cover: img, url, latestCh: "" });
      });
    }

    console.log(`/search "${q}" → ${results.length} results`);
    res.json({ results });
  } catch (e) {
    console.error("/search error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ── MANGA DETAIL + CHAPTERS ──────────────────────────── */
app.get("/manga", async (req, res) => {
  try {
    const id = req.query.id; // e.g. manga-aa951409
    const url = id.startsWith("http") ? id : `https://manganato.com/${id}`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    const title =
      $("div.story-info-right h1").text().trim() ||
      $("h1.story-info-right").text().trim() ||
      $("h1").first().text().trim();

    const cover =
      $("div.story-info-left img").attr("src") ||
      $("span.info-image img").attr("src") ||
      $("img.img-loading").attr("src") || "";

    let desc =
      $("div.panel-story-info-description").text().trim() ||
      $("div#story_discription").text().trim() ||
      $("div.story-info-description").text().trim() || "";
    desc = desc.replace(/^Description\s*[:\-]?\s*/i, "").replace(/MangaNato\.com/gi, "").trim();

    const genres = [];
    $("table.variations-tableInfo tr, div.story-info-right table tr").last().find("a").each((_, a) => {
      genres.push($(a).text().trim());
    });

    let status = "", author = "";
    $("table.variations-tableInfo tr, div.story-info-right table tr").each((_, tr) => {
      const label = $(tr).find("td.table-label, td:first-child").text().toLowerCase();
      if (label.includes("status")) status = $(tr).find("td.table-value, td:last-child").text().trim();
      if (label.includes("author")) author = $(tr).find("a").first().text().trim();
    });

    // Chapters
    const chapters = [];
    $("div.panel-story-chapter-list li.a-h, ul.row-content-chapter li").each((_, li) => {
      const a = $(li).find("a").first();
      const chUrl = a.attr("href") || "";
      const chTitle = a.text().trim();
      const date = $(li).find("span.chapter-time, span[title]").text().trim();
      const chId = chUrl.replace(/^https?:\/\/[^/]+\//, "");
      const numMatch = chTitle.match(/chapter\s*([\d.]+)/i);
      const chNum = numMatch ? numMatch[1] : chTitle;
      if (chId) chapters.push({ id: chId, url: chUrl, title: chTitle, chapter: chNum, date });
    });
    chapters.reverse();

    console.log(`/manga ${id} → "${title}", ${chapters.length} chapters`);
    res.json({ id, title, cover, desc, genres, status, author, chapters });
  } catch (e) {
    console.error("/manga error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ── CHAPTER PAGES ────────────────────────────────────── */
app.get("/pages", async (req, res) => {
  try {
    const chId = req.query.id; // e.g. manga-aa951409/chapter-1007
    const url = chId.startsWith("http") ? chId : `https://chapmanganato.to/${chId}`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    const images = [];
    $("div.container-chapter-reader img, div.reading-detail img, div#vungdoc img").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src") || "";
      if (src.startsWith("http")) images.push(src);
    });

    console.log(`/pages ${chId} → ${images.length} images`);
    res.json({ images });
  } catch (e) {
    console.error("/pages error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ── IMAGE PROXY ─────────────────────────────────────── */
app.get("/proxy", async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url || "");
    if (!url.startsWith("http")) return res.status(400).end();
    const r = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: {
        "User-Agent": ua(),
        "Referer": "https://manganato.com/",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    res.set("Content-Type", r.headers["content-type"] || "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800");
    res.send(r.data);
  } catch {
    res.status(500).end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
