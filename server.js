const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// serve your frontend
app.use(express.static(path.join(__dirname, "public")));

const BASE = "https://mangafire.to";

const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  "Referer": BASE
};

/* ───────── SEARCH ───────── */
app.get("/search", async (req, res) => {
  try {
    const q = req.query.q || "";

    const r = await axios.get(`${BASE}/filter`, {
      params: { keyword: q },
      headers: HEADERS
    });

    const $ = cheerio.load(r.data);
    const results = [];

    $(".unit").each((i, el) => {
      const a = $(el).find("a.poster");
      const href = a.attr("href") || "";

      const id = href.replace("/manga/", "").trim();
      const title = $(el).find(".info a").first().text().trim();
      const img = $(el).find("img").attr("src") || "";

      if (id) {
        results.push({ id, title, cover: img });
      }
    });

    res.json({ results });

  } catch (e) {
    res.json({ results: [] });
  }
});

/* ───────── TRENDING ───────── */
app.get("/trending", async (req, res) => {
  try {
    const r = await axios.get(`${BASE}/home`, { headers: HEADERS });
    const $ = cheerio.load(r.data);

    const results = [];

    $(".unit").each((i, el) => {
      if (results.length >= 20) return;

      const a = $(el).find("a.poster");
      const href = a.attr("href") || "";

      const id = href.replace("/manga/", "").trim();
      const title = $(el).find(".info a").first().text().trim();
      const img = $(el).find("img").attr("src") || "";

      if (id) {
        results.push({ id, title, cover: img });
      }
    });

    res.json({ results });

  } catch (e) {
    res.json({ results: [] });
  }
});

/* ───────── CHAPTERS ───────── */
app.get("/chapters", async (req, res) => {
  try {
    const id = req.query.id;

    const r = await axios.get(`${BASE}/manga/${id}`, { headers: HEADERS });
    const $ = cheerio.load(r.data);

    const chapters = [];

    $("li").each((i, el) => {
      const a = $(el).find("a");
      const href = a.attr("href") || "";

      if (!href.includes("/read/")) return;

      const chapterId = href.replace(/^\//, "");

      const num = href.match(/chapter-(\d+(\.\d+)?)/);
      const chapter = num ? num[1] : String(i + 1);

      chapters.push({
        id: chapterId,
        chapter
      });
    });

    chapters.reverse();

    res.json({ chapters });

  } catch (e) {
    res.json({ chapters: [] });
  }
});

/* ───────── PAGES ───────── */
app.get("/pages", async (req, res) => {
  try {
    const id = req.query.id;

    const r = await axios.get(`${BASE}/${id}`, { headers: HEADERS });
    const $ = cheerio.load(r.data);

    const images = [];

    $("img").each((i, el) => {
      const src = $(el).attr("src") || "";
      if (src.startsWith("http")) {
        images.push(src);
      }
    });

    res.json({ images });

  } catch (e) {
    res.json({ images: [] });
  }
});

/* ───────── IMAGE PROXY ───────── */
app.get("/proxy", async (req, res) => {
  try {
    const url = req.query.url;

    const r = await axios.get(url, {
      responseType: "arraybuffer",
      headers: HEADERS
    });

    res.set("Content-Type", r.headers["content-type"]);
    res.send(r.data);

  } catch (e) {
    res.status(500).send("error");
  }
});

/* ───────── START ───────── */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
