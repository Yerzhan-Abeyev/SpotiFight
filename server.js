import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory token cache ─────────────────────────────────────────────────────
let cachedToken  = null;
let tokenExpiry  = 0;

async function getSpotifyToken() {
    if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    if (!res.ok) throw new Error(`Spotify token error: ${res.status}`);
    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
}

// ── POST /api/spotify/search ──────────────────────────────────────────────────
app.get('/api/spotify/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ error: 'Missing query' });

        const token = await getSpotifyToken();
        const url   = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8&market=US`;
        const spotRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

        if (!spotRes.ok) throw new Error(`Spotify search error: ${spotRes.status}`);
        const data = await spotRes.json();
        res.json(data.tracks.items);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅  SpotiFight running at http://localhost:${PORT}`));
