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
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://mangafire.to/",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5"
};

/* ─────────────────────────────
   SEARCH (FIXED + STABLE)
──────────────────────────── */
app.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").toLowerCase().trim();

    const sources = [
      "/filter?keyword=" + encodeURIComponent(q),
      "/home"
    ];

    let results = [];

    for (const url of sources) {
      try {
        const r = await axios.get(BASE + url, {
          headers: HEADERS,
          timeout: 15000
        });

        const $ = cheerio.load(r.data);

        $(".unit").each((i, el) => {
          const a = $(el).find("a").first();
          const href = a.attr("href");
          if (!href || !href.includes("/manga/")) return;

          const title =
            $(el).find(".info a").first().text().trim() ||
            $(el).find("img").attr("alt") ||
            "";

          if (!title) return;

          const img =
            $(el).find("img").attr("src") ||
            $(el).find("img").attr("data-src") ||
            "";

          // FIXED ID PARSING
          const id = href.split("/manga/")[1]?.replace(/\/$/, "");
          if (!id) return;

          results.push({
            id,
            title,
            cover: img
          });
        });

      } catch (e) {
        console.log("SCRAPE FAIL:", url, e.message);
      }
    }

    // FINAL FILTER (ONLY ONCE)
    if (q) {
      results = results.filter(m =>
        m.title.toLowerCase().includes(q)
      );
    }

    // REMOVE DUPLICATES
    results = results.filter(
      (v, i, a) => a.findIndex(t => t.id === v.id) === i
    );

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
        $(el).find("img").attr("alt") ||
        "Unknown";

      const img =
        $(el).find("img").attr("src") ||
        $(el).find("img").attr("data-src") ||
        "";

      if (results.length < 20) {
        results.push({ id, title, cover: img });
      }
    });

    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: "trending failed", detail: e.message });
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

    const title =
      $("h1.name").text().trim() ||
      $(".manga-name h1").text().trim();

    const cover =
      $(".poster img").attr("src") ||
      $(".manga-poster img").attr("src") ||
      "";

    const description =
      $(".synopsis p").text().trim() ||
      $("[class*='synopsis']").text().trim();

    const genres = [];
    $(".genres a").each((i, el) =>
      genres.push($(el).text().trim())
    );

    const status =
      $(".info .status").first().text().trim();

    const author =
      $(".info a[href*='author']").first().text().trim();

    res.json({
      id,
      title,
      cover,
      description,
      genres,
      status,
      author
    });

  } catch (e) {
    res.status(500).json({ error: "manga details failed", detail: e.message });
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

    $("[id$='-chapters'] li, .chapter-list li").each((i, el) => {
      const a = $(el).find("a");
      const href = a.attr("href");
      if (!href) return;

      const chapterId = href.replace("/", "");

      const chapterNum =
        href.match(/chapter-(\d+(\.\d+)?)/)?.[1] || String(i + 1);

      const title =
        a.find(".name, span").first().text().trim() ||
        `Chapter ${chapterNum}`;

      const date = $(el).find(".date").text().trim();

      chapters.push({
        id: chapterId,
        chapter: chapterNum,
        title,
        date
      });
    });

    chapters.reverse();

    res.json({ chapters });

  } catch (e) {
    res.status(500).json({ error: "chapters failed", detail: e.message });
  }
});

/* ─────────────────────────────
   PAGES
──────────────────────────── */
app.get("/pages", async (req, res) => {
  try {
    const chapterId = req.query.id;

    const r = await axios.get(`${BASE}/${chapterId}`, {
      headers: HEADERS
    });

    const $ = cheerio.load(r.data);

    const images = [];

    $(".page-break img, .reading-content img").each((i, el) => {
      const src =
        $(el).attr("src") ||
        $(el).attr("data-src") ||
        "";

      if (src) images.push(src);
    });

    res.json({ images });

  } catch (e) {
    res.status(500).json({ error: "pages failed", detail: e.message });
  }
});

/* ─────────────────────────────
   IMAGE PROXY
──────────────────────────── */
app.get("/proxy", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).send("no url");

    const r = await axios.get(url, {
      responseType: "arraybuffer",
      headers: HEADERS
    });

    res.set("Content-Type", r.headers["content-type"]);
    res.send(r.data);

  } catch (e) {
    res.status(500).send("proxy failed");
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server running...")
);
