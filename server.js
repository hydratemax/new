const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const BASE = 'https://api.mangadex.org';

// Root test (VERY IMPORTANT)
app.get('/', (req, res) => {
  res.send('✅ Server is working');
});

// Search manga
app.get('/search', async (req, res) => {
  try {
    const q = req.query.q || 'naruto';

    const response = await axios.get(`${BASE}/manga`, {
      params: {
        title: q,
        limit: 10,
        includes: ['cover_art']
      }
    });

    res.json(response.data);
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ error: 'Failed to fetch manga' });
  }
});

// Chapters
app.get('/chapters/:id', async (req, res) => {
  try {
    const response = await axios.get(`${BASE}/chapter`, {
      params: {
        manga: req.params.id,
        limit: 50,
        translatedLanguage: ['en'],
        order: { chapter: 'desc' }
      }
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chapters' });
  }
});

// Pages
app.get('/pages/:chapterId', async (req, res) => {
  try {
    const response = await axios.get(`${BASE}/at-home/server/${req.params.chapterId}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

app.listen(3000, () => {
  console.log('🔥 Server running at http://localhost:3000');
});