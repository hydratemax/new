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
    res.status(500).json({ error: "search failed" });
  }
});

/* ─────────────────────────────
   GET CHAPTER LIST (IMPORTANT FIX)
──────────────────────────── */
app.get("/chapters", async (req, res) => {
  try {
    const id = req.query.id;

    const r = await axios.get(`${MD}/manga/${id}/feed`, {
      params: {
        limit: 100,
        translatedLanguage: ["en"],
        order: { chapter: "asc" }
      }
    });

    // clean output (important for UI)
    const chapters = r.data.data.map(c => ({
      id: c.id,
      chapter: c.attributes.chapter || "0",
      title: c.attributes.title || ""
    }));

    res.json({ chapters });

  } catch (e) {
    res.status(500).json({ error: "chapters failed" });
  }
});

/* ─────────────────────────────
   GET PAGES
──────────────────────────── */
app.get("/pages", async (req, res) => {
  try {
    const chapterId = req.query.id;

    const r = await axios.get(`${MD}/at-home/server/${chapterId}`);

    const d = r.data;

    const data = Array.isArray(d.chapter.data) ? d.chapter.data : [];
    const saver = Array.isArray(d.chapter.dataSaver) ? d.chapter.dataSaver : [];

    res.json({
      baseUrl: d.baseUrl,
      hash: d.chapter.hash,
      data,
      dataSaver: saver
    });

  } catch (e) {
    res.status(500).json({ error: "pages failed" });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);
