const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
app.use(cors());
app.use(express.json());

// ── Verified selectors from manganato.com ──
// Search:   GET https://manganato.com/search/story/{query}
//   results:  div.panel-search-story > div.search-story-item
//   cover:    img[src]
//   title+url: div.item-right > h3 > a
//   chapter:  a.item-chapter
//
// Latest:   GET https://manganato.com/genre-all
//   results:  div.panel-content-genres > div.content-genres-item
//   cover:    a.genres-item-img img
//   title+url: div.genres-item-info h3 a
//
// Manga detail: GET https://manganato.com/manga-{id}
//   title:    div.story-info-right h1
//   cover:    div.story-info-left img
//   desc:     div.panel-story-info-description
//   chapters: div.panel-story-chapter-list ul.row-content-chapter li.a-h
//             a[href], a.text, span.chapter-time
//
// Pages:    GET https://chapmanganato.to/manga-{id}/chapter-{n}
//   images:   div.container-chapter-reader img

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://manganato.com/",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchPage(url) {
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  return cheerio.load(res.data);
}

/* ─────────────────────────────
   LATEST / HOME
   GET /latest
──────────────────────────── */
app.get("/latest", async (req, res) => {
  try {
    const $ = await fetchPage("https://manganato.com/genre-all");
    const results = [];

    $("div.panel-content-genres div.content-genres-item").each((_, el) => {
      const img = $(el).find("a.genres-item-img img").attr("src") || "";
      const a = $(el).find("div.genres-item-info h3 a").first();
      const title = a.text().trim();
      const url = a.attr("href") || "";
      const latestCh = $(el).find("div.genres-item-info a").eq(1).text().trim();
      const id = url.split("/").pop();
      if (id && title) results.push({ id, title, cover: img, url, latestCh });
    });

    res.json({ results });
  } catch (e) {
    console.error("/latest error:", e.message);
    res.status(500).json({ error: "latest failed", detail: e.message });
  }
});

/* ─────────────────────────────
   SEARCH
   GET /search?q=one+piece
──────────────────────────── */
app.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").replace(/\s+/g, "_").replace(/[!,?~|()']/g, "");
    const $ = await fetchPage(`https://manganato.com/search/story/${encodeURIComponent(q)}`);
    const results = [];

    $("div.panel-search-story div.search-story-item").each((_, el) => {
      const img = $(el).find("img").attr("src") || "";
      const a = $(el).find("div.item-right h3 a").first();
      const title = a.text().trim();
      const url = a.attr("href") || "";
      const latestCh = $(el).find("a.item-chapter").first().text().trim();
      const id = url.split("/").pop();
      if (id && title) results.push({ id, title, cover: img, url, latestCh });
    });

    res.json({ results });
  } catch (e) {
    console.error("/search error:", e.message);
    res.status(500).json({ error: "search failed", detail: e.message });
  }
});

/* ─────────────────────────────
   MANGA DETAIL + CHAPTERS
   GET /manga?id=manga-aa951409
──────────────────────────── */
app.get("/manga", async (req, res) => {
  try {
    const id = req.query.id;
    const $ = await fetchPage(`https://manganato.com/${id}`);

    const title = $("div.story-info-right h1").text().trim();
    const cover = $("div.story-info-left img").attr("src") || "";
    let desc = $("div.panel-story-info-description").text().trim();
    desc = desc.replace(/^Description\s*:\s*/i, "").replace("MangaNato.com", "").trim();

    const genres = [];
    $("table.variations-tableInfo tr").last().find("a.a-h").each((_, el) => {
      genres.push($(el).text().trim());
    });

    let status = "";
    $("table.variations-tableInfo tr").each((_, tr) => {
      const label = $(tr).find("td.table-label").text().toLowerCase();
      if (label.includes("status")) {
        status = $(tr).find("td.table-value").text().trim();
      }
    });

    let author = "";
    $("table.variations-tableInfo tr").each((_, tr) => {
      const label = $(tr).find("td.table-label").text().toLowerCase();
      if (label.includes("author")) {
        author = $(tr).find("td.table-value a").first().text().trim();
      }
    });

    // Chapters — already in newest-first order on site, we reverse for ch1-first
    const chapters = [];
    $("div.panel-story-chapter-list ul.row-content-chapter li.a-h").each((_, li) => {
      const a = $(li).find("a").first();
      const chUrl = a.attr("href") || "";
      const chTitle = a.text().trim();
      const date = $(li).find("span.chapter-time").text().trim();
      // chUrl like https://chapmanganato.to/manga-aa951409/chapter-1007
      const chId = chUrl.replace(/^https?:\/\/[^/]+\//, ""); // manga-xxx/chapter-n
      const numMatch = chTitle.match(/chapter\s*([\d.]+)/i);
      const chNum = numMatch ? numMatch[1] : chTitle;
      if (chId) chapters.push({ id: chId, url: chUrl, title: chTitle, chapter: chNum, date });
    });
    chapters.reverse(); // ch1 first

    res.json({ id, title, cover, desc, genres, status, author, chapters });
  } catch (e) {
    console.error("/manga error:", e.message);
    res.status(500).json({ error: "manga failed", detail: e.message });
  }
});

/* ─────────────────────────────
   CHAPTER PAGES
   GET /pages?id=manga-aa951409/chapter-1007
──────────────────────────── */
app.get("/pages", async (req, res) => {
  try {
    const chId = req.query.id; // e.g. manga-aa951409/chapter-1007
    const $ = await fetchPage(`https://chapmanganato.to/${chId}`);

    const images = [];
    $("div.container-chapter-reader img").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src") || "";
      if (src.startsWith("http")) images.push(src);
    });

    res.json({ images });
  } catch (e) {
    console.error("/pages error:", e.message);
    res.status(500).json({ error: "pages failed", detail: e.message });
  }
});

/* ─────────────────────────────
   IMAGE PROXY
   GET /proxy?url=https://...
──────────────────────────── */
app.get("/proxy", async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url || "");
    if (!url.startsWith("http")) return res.status(400).end();

    const r = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: {
        "User-Agent": HEADERS["User-Agent"],
        "Referer": "https://manganato.com/",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    res.set("Content-Type", r.headers["content-type"] || "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800"); // 7 days
    res.send(r.data);
  } catch (e) {
    res.status(500).end();
  }
});

/* ─────────────────────────────
   HEALTH CHECK
──────────────────────────── */
app.get("/", (_, res) => res.json({ status: "ok", source: "manganato.com" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ MangaNato server running on port ${PORT}`));
