const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
app.use(cors());
app.use(express.json());

const BASE = "https://mangafire.to";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://mangafire.to/",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5"
};

/* ─────────────────────────────
   SEARCH
   GET /search?q=naruto
──────────────────────────── */
app.get("/search", async (req, res) => {
  try {
    const q = req.query.q || "";
    const r = await axios.get(`${BASE}/filter`, {
      params: { keyword: q },
      headers: HEADERS
    });
    const $ = cheerio.load(r.data);
    const results = [];

    $(".original.card-lg .unit").each((i, el) => {
      const a = $(el).find("a.poster");
      const href = a.attr("href") || "";
      const id = href.replace("/manga/", "").trim();
      const title = $(el).find(".info a").first().text().trim() ||
                    $(el).find("a").attr("title") || "Unknown";
      const img = $(el).find("img").attr("src") || $(el).find("img").attr("data-src") || "";
      const latestChapter = $(el).find(".info .tick-item").first().text().trim() || "";

      if (id) {
        results.push({ id, title, cover: img, latestChapter });
      }
    });

    res.json({ results });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "search failed", detail: e.message });
  }
});

/* ─────────────────────────────
   TRENDING / HOME
   GET /trending
──────────────────────────── */
app.get("/trending", async (req, res) => {
  try {
    const r = await axios.get(`${BASE}/home`, { headers: HEADERS });
    const $ = cheerio.load(r.data);
    const results = [];

    $(".swiper-slide .unit, .manga-list .unit").each((i, el) => {
      const a = $(el).find("a.poster");
      const href = a.attr("href") || "";
      const id = href.replace("/manga/", "").trim();
      const title = $(el).find(".info a").first().text().trim() || "Unknown";
      const img = $(el).find("img").attr("src") || $(el).find("img").attr("data-src") || "";

      if (id && results.length < 20) {
        results.push({ id, title, cover: img });
      }
    });

    res.json({ results });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "trending failed", detail: e.message });
  }
});

/* ─────────────────────────────
   MANGA DETAILS
   GET /manga?id=one-piece.ovm
──────────────────────────── */
app.get("/manga", async (req, res) => {
  try {
    const id = req.query.id;
    const r = await axios.get(`${BASE}/manga/${id}`, { headers: HEADERS });
    const $ = cheerio.load(r.data);

    const title = $("h1.name").text().trim() || $(".manga-name h1").text().trim();
    const cover = $(".poster img").attr("src") || $(".manga-poster img").attr("src") || "";
    const description = $(".synopsis p").text().trim() || $("[class*='synopsis']").text().trim();
    const genres = [];
    $(".genres a, [class*='genre'] a").each((i, el) => genres.push($(el).text().trim()));
    const status = $(".info .status, [class*='status']").first().text().trim();
    const author = $(".info a[href*='author'], [class*='author'] a").first().text().trim();

    res.json({ id, title, cover, description, genres, status, author });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "manga details failed", detail: e.message });
  }
});

/* ─────────────────────────────
   CHAPTER LIST
   GET /chapters?id=one-piece.ovm
──────────────────────────── */
app.get("/chapters", async (req, res) => {
  try {
    const id = req.query.id;
    const r = await axios.get(`${BASE}/manga/${id}`, { headers: HEADERS });
    const $ = cheerio.load(r.data);

    // MangaFire loads chapters in #en-chapters or similar
    const chapters = [];

    // Try the chapter list container
    $("[id$='-chapters'] li, .chapter-list li, #en-chapters li").each((i, el) => {
      const a = $(el).find("a");
      const href = a.attr("href") || "";
      // href format: /read/manga-id/en/chapter-X
      const chapterId = href.replace(/^\//, "");
      const chapterNum = href.match(/chapter-(\d+(?:\.\d+)?)/)?.[1] || String(i + 1);
      const title = a.find(".name, span").first().text().trim() || `Chapter ${chapterNum}`;
      const date = $(el).find(".date, time").text().trim() || "";

      if (chapterId) {
        chapters.push({ id: chapterId, chapter: chapterNum, title, date });
      }
    });

    // Reverse so chapter 1 is first
    chapters.reverse();

    res.json({ chapters });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "chapters failed", detail: e.message });
  }
});

/* ─────────────────────────────
   PAGES / IMAGES
   GET /pages?id=read/one-piece.ovm/en/chapter-1
──────────────────────────── */
app.get("/pages", async (req, res) => {
  try {
    const chapterId = req.query.id; // e.g. "read/one-piece.ovm/en/chapter-1"
    const r = await axios.get(`${BASE}/${chapterId}`, { headers: HEADERS });
    const $ = cheerio.load(r.data);

    const images = [];

    // MangaFire reader pages
    $(".page-break img, .reading-content img, [class*='page'] img").each((i, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src") || "";
      if (src && src.startsWith("http")) images.push(src);
    });

    // Fallback: find images in script tags (some sites embed page data as JSON)
    if (images.length === 0) {
      const scripts = $("script").toArray().map(s => $(s).html() || "");
      for (const script of scripts) {
        const match = script.match(/pages\s*[:=]\s*(\[.*?\])/s);
        if (match) {
          try {
            const pages = JSON.parse(match[1]);
            pages.forEach(p => {
              const url = typeof p === "string" ? p : p.url || p.src || p.img || "";
              if (url) images.push(url);
            });
          } catch (_) {}
        }
      }
    }

    res.json({ images });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "pages failed", detail: e.message });
  }
});

/* ─────────────────────────────
   PROXY IMAGE (bypass hotlink protection)
   GET /proxy?url=https://...
──────────────────────────── */
app.get("/proxy", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "no url" });

    const r = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        ...HEADERS,
        Accept: "image/webp,image/apng,image/*,*/*;q=0.8"
      }
    });

    const contentType = r.headers["content-type"] || "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(r.data);
  } catch (e) {
    res.status(500).json({ error: "proxy failed" });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("MangaFire server running on port", process.env.PORT || 3000)
);
