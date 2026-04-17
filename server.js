const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());

const MD = "https://api.mangadex.org";

/* ─────────────────────────────
   SEARCH
──────────────────────────── */
app.get("/search", async (req, res) => {
  try {
    const q = req.query.q || "";

    const r = await axios.get(`${MD}/manga`, {
      params: {
        title: q,
        limit: 20,
        includes: ["cover_art"]
      }
    });

    res.json(r.data);

  } catch (e) {
    console.log("SEARCH ERROR:", e.message);
    res.status(500).json({ error: "search failed" });
  }
});

/* ─────────────────────────────
   CHAPTERS
──────────────────────────── */
app.get("/chapters", async (req, res) => {
  try {
    const id = req.query.id;

    const r = await axios.get(`${MD}/manga/${id}/feed`, {
      params: {
        limit: 50,
        translatedLanguage: ["en"],
        order: { chapter: "desc" }
      }
    });

    res.json(r.data);

  } catch (e) {
    console.log("CHAPTER ERROR:", e.message);
    res.status(500).json({ error: "chapters failed" });
  }
});

/* ─────────────────────────────
   PAGES (STRICT FIX)
──────────────────────────── */
app.get("/pages", async (req, res) => {
  try {
    const chapterId = req.query.id;

    const r = await axios.get(`${MD}/at-home/server/${chapterId}`);

    const d = r.data;

    // HARD VALIDATION
    if (!d || !d.chapter || !d.chapter.hash) {
      return res.status(500).json({ error: "invalid chapter data" });
    }

    const data = Array.isArray(d.chapter.data) ? d.chapter.data : [];
    const saver = Array.isArray(d.chapter.dataSaver) ? d.chapter.dataSaver : [];

    res.json({
      baseUrl: d.baseUrl,
      hash: d.chapter.hash,
      data,
      dataSaver: saver
    });

  } catch (e) {
    console.log("PAGES ERROR:", e.message);
    res.status(500).json({ error: "pages failed" });
  }
});

app.get("/", (req, res) => {
  res.send("Manga API running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
