const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());

const MD = "https://api.mangadex.org";

/* ─────────────────────────────
   SEARCH MANGA
──────────────────────────── */
app.get("/search", async (req, res) => {
  try {
    const q = req.query.q || "";

    const result = await axios.get(`${MD}/manga`, {
      params: {
        title: q,
        limit: 20,
        includes: ["cover_art", "author"]
      }
    });

    res.json(result.data);

  } catch (err) {
    console.log("SEARCH ERROR:", err.message);
    res.status(500).json({ error: "search failed" });
  }
});

/* ─────────────────────────────
   CHAPTER FEED
──────────────────────────── */
app.get("/chapters", async (req, res) => {
  try {
    const id = req.query.id;

    const result = await axios.get(`${MD}/manga/${id}/feed`, {
      params: {
        limit: 20,
        translatedLanguage: ["en"]
      }
    });

    res.json(result.data);

  } catch (err) {
    console.log("CHAPTER ERROR:", err.message);
    res.status(500).json({ error: "chapter fetch failed" });
  }
});

/* ─────────────────────────────
   CHAPTER IMAGES (FIXED)
──────────────────────────── */
app.get("/pages", async (req, res) => {
  try {
    const chapterId = req.query.id;

    const result = await axios.get(`${MD}/at-home/server/${chapterId}`);

    const d = result.data;

    res.json({
      baseUrl: d.baseUrl,
      hash: d.chapter.hash,
      data: d.chapter.data,
      dataSaver: d.chapter.dataSaver
    });

  } catch (err) {
    console.log("PAGES ERROR:", err.message);
    res.status(500).json({ error: "pages fetch failed" });
  }
});

app.get("/", (req, res) => {
  res.send("Manga API running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
