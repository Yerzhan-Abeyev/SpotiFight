import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Static files ──────────────────────────────────────────────────────────────
// Serve root-level HTML files and any css/js/assets directly from project root.
// Only named files are exposed — server.js / config.js / .env are not served.
const HTML_FILES = ['home.html', 'index.html', 'artist.html', 'test.html'];
HTML_FILES.forEach(f => {
    app.get(`/${f}`, (_req, res) => res.sendFile(path.join(__dirname, f)));
});
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'home.html')));
// Serve config.js (credentials loaded by the HTML pages)
app.get('/config.js', (_req, res) => res.sendFile(path.join(__dirname, 'config.js')));
// Serve compiled Tailwind CSS
app.get('/tw.css', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'tw.css')));

// ── GET /api/daily ────────────────────────────────────────────────────────────
// Returns today's word of the day.
// Weekday (Mon–Fri) → easy/medium pool.  Weekend (Sat–Sun) → medium/hard pool.
// Word is deterministic for the day: same word for all players on the same date.
app.get('/api/daily', (_req, res) => {
    try {
        const words = JSON.parse(readFileSync(path.join(__dirname, 'daily-words.json'), 'utf-8'));

        const now   = new Date();
        const day   = now.getDay();                    // 0 = Sun, 6 = Sat
        const isWeekend = day === 0 || day === 6;
        const pool  = isWeekend ? words.weekend : words.weekday;

        // Build a date string and hash it for a stable, date-keyed pick
        const dateStr = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
        let h = 0;
        for (const c of dateStr) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
        h = Math.abs(h);

        const word = pool[h % pool.length];
        res.json({ word, date: dateStr, type: isWeekend ? 'weekend' : 'weekday' });
    } catch (err) {
        console.error('Daily word error:', err);
        res.status(500).json({ error: 'Could not load daily word' });
    }
});

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

    if (!res.ok) {
        const errBody = await res.text();
        console.error(`Spotify token error ${res.status}:`, errBody);
        throw new Error(`Spotify token error: ${res.status}`);
    }
    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
}

// ── POST /api/spotify/search ──────────────────────────────────────────────────
app.get('/api/spotify/search', async (req, res) => {
    try {
        const { q, limit, type = 'track' } = req.query;
        if (!q) return res.status(400).json({ error: 'Missing query' });

        const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 8));
        const token = await getSpotifyToken();
        const url   = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=${safeLimit}&market=US`;
        const spotRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

        if (!spotRes.ok) {
            const errBody = await spotRes.text();
            console.error(`Spotify search error ${spotRes.status}:`, errBody);
            throw new Error(`Spotify search error: ${spotRes.status} — ${errBody}`);
        }
        const data  = await spotRes.json();
        const items = type === 'artist' ? data.artists?.items : data.tracks?.items;
        res.json(items || []);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅  SpotiFight running at http://localhost:${PORT}`));
