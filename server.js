import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer);

// ── Static files ──────────────────────────────────────────────────────────────
const HTML_FILES = ['home.html', 'globalmode.html', 'localmode.html', 'duel.html', 'test.html'];
HTML_FILES.forEach(f => {
    app.get(`/${f}`, (_req, res) => res.sendFile(path.join(__dirname, f)));
});
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'home.html')));

// ── GET /api/daily ────────────────────────────────────────────────────────────
app.get('/api/daily', (_req, res) => {
    try {
        const words = JSON.parse(readFileSync(path.join(__dirname, 'daily-words.json'), 'utf-8'));
        const now   = new Date();
        const day   = now.getDay();
        const isWeekend = day === 0 || day === 6;
        const pool  = isWeekend ? words.weekend : words.weekday;
        const dateStr = now.toISOString().slice(0, 10);
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
let cachedToken = null;
let tokenExpiry = 0;

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

// ── GET /api/spotify/token ────────────────────────────────────────────────────
app.get('/api/spotify/token', async (_req, res) => {
    try {
        const token = await getSpotifyToken();
        res.json({ access_token: token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/spotify/search ───────────────────────────────────────────────────
app.get('/api/spotify/search', async (req, res) => {
    try {
        const { q, type = 'track' } = req.query;
        if (!q) return res.status(400).json({ error: 'Missing query' });
        const limit = type === 'artist' ? 5 : 20;
        const token = await getSpotifyToken();
        const url   = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}&market=US`;
        const spotRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!spotRes.ok) {
            const errBody = await spotRes.text();
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

// ── DUEL: helpers ─────────────────────────────────────────────────────────────
const DUEL_WORDS = [
    // Body & emotion
    'love','heart','soul','mind','eyes','tears','voice','smile','kiss','hands',
    'arms','lips','body','breath','skin','blood','bones','chest','head','feet',
    // Feelings
    'feel','pain','fear','hope','dream','cry','miss','hurt','happy','sad',
    'lost','broken','alive','alone','free','strong','wild','real','true','wrong',
    // People
    'girl','boy','baby','friend','angel','mother','father','king','queen','woman',
    // Time & place
    'night','time','life','day','home','world','road','sky','sun','moon',
    'stars','rain','fire','light','dark','storm','shadow','ocean','river','door',
    'city','street','floor','room','wall','window','bed','ground','earth','sea',
    // Actions
    'run','fall','fly','rise','dance','fight','hold','break','leave','find',
    'come','walk','lose','move','save','burn','stay','give','take','play',
    'shine','fade','hide','wait','stop','scream','sing','speak','laugh','know',
    // Descriptors
    'cold','warm','young','old','deep','high','low','fast','slow','long',
    // Common song words
    'song','name','face','road','way','back','away','tonight','forever','better',
    'never','always','still','together','inside','without','around','again','money','gold',
    'summer','winter','morning','midnight','silence','music','beat','party','memory','chance',
];

function pickDuelWord() {
    return DUEL_WORDS[Math.floor(Math.random() * DUEL_WORDS.length)];
}

function wordInText(word, text) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return re.test(text);
}

async function fetchLyricsServer(trackName, artist) {
    const title = trackName.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
    const art   = artist.split(',')[0].trim();
    try {
        const controller = new AbortController();
        const timeout    = setTimeout(() => controller.abort(), 1000);
        const res = await fetch(
            `https://api.lyrics.ovh/v1/${encodeURIComponent(art)}/${encodeURIComponent(title)}`,
            { signal: controller.signal }
        );
        clearTimeout(timeout);
        if (!res.ok) return null;
        const data = await res.json();
        return data.lyrics || null;
    } catch { return null; }
}

function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── DUEL: room state ──────────────────────────────────────────────────────────
// rooms: Map<code, { players: [socketId, socketId?], names: {}, scores: {}, word, roundActive, timer, roundNum }>
const rooms = new Map();

const ROUNDS_TO_WIN = 5;
const ROUND_TIME_MS = 20_000;

function startRound(code) {
    const room = rooms.get(code);
    if (!room) return;

    clearTimeout(room.timer);
    const word        = pickDuelWord();
    room.word         = word;
    room.roundActive  = true;
    room.roundNum     = (room.roundNum || 0) + 1;
    room.wrongPlayers = new Set();   // reset locked-out players each round
    room.submissions  = {};          // reset song picks each round

    io.to(code).emit('round_start', { word, roundNum: room.roundNum });

    room.timer = setTimeout(() => {
        const r = rooms.get(code);
        if (!r || !r.roundActive) return;
        r.roundActive = false;
        io.to(code).emit('round_skip', { word, submissions: r.submissions });
        setTimeout(() => startRound(code), 2500);
    }, ROUND_TIME_MS);
}

// ── DUEL: socket events ───────────────────────────────────────────────────────
io.on('connection', socket => {

    socket.on('create_room', ({ name }) => {
        let code;
        do { code = generateCode(); } while (rooms.has(code));

        rooms.set(code, {
            players:     [socket.id],
            names:       { [socket.id]: name || 'Player 1' },
            scores:      { [socket.id]: 0 },
            word:        null,
            roundActive: false,
            timer:       null,
            roundNum:    0,
        });
        socket.join(code);
        socket.roomCode = code;
        socket.emit('room_created', { code });
        console.log(`Room ${code} created by ${socket.id}`);
    });

    socket.on('join_room', ({ code, name }) => {
        const room = rooms.get(code);
        if (!room)                    { socket.emit('join_error', { msg: 'Room not found.' }); return; }
        if (room.players.length >= 2) { socket.emit('join_error', { msg: 'Room is full.' });  return; }

        room.players.push(socket.id);
        room.names[socket.id]  = name || 'Player 2';
        room.scores[socket.id] = 0;
        socket.join(code);
        socket.roomCode = code;

        // Tell both players the names and that the game is starting
        const [p1, p2] = room.players;
        io.to(code).emit('game_start', {
            yourId:       socket.id,      // only p2 needs this but both get it
            players: {
                [p1]: { name: room.names[p1], score: 0 },
                [p2]: { name: room.names[p2], score: 0 },
            },
        });
        // Also tell p1 their own id via a targeted emit
        io.to(p1).emit('your_id', { id: p1 });
        io.to(p2).emit('your_id', { id: p2 });

        console.log(`Room ${code}: ${room.names[p1]} vs ${room.names[p2]}`);
        setTimeout(() => startRound(code), 1000);
    });

    socket.on('submit_song', async ({ trackName, artist, trackData }) => {
        const code = socket.roomCode;
        const room = rooms.get(code);
        if (!room || !room.roundActive) return;

        // Player already got a wrong answer this round — ignore
        if (room.wrongPlayers.has(socket.id)) return;

        const word = room.word;

        // Word in title — not a lockout, just a reminder
        if (wordInText(word, trackName)) {
            socket.emit('submit_result', { result: 'word_in_title' });
            return;
        }

        // Record this submission (past the title check, so it's a real attempt)
        room.submissions[socket.id] = { trackName, artist };

        // Fetch lyrics server-side — timer keeps running during this
        const lyrics = await fetchLyricsServer(trackName, artist);
        if (!lyrics) {
            socket.emit('submit_result', { result: 'no_lyrics' });
            return;
        }

        if (wordInText(word, lyrics)) {
            // ── WIN ──
            room.roundActive = false;
            clearTimeout(room.timer);
            room.scores[socket.id]++;

            const scores   = { ...room.scores };
            const myScore  = room.scores[socket.id];
            const oppId    = room.players.find(id => id !== socket.id);
            const oppScore = room.scores[oppId] || 0;

            io.to(code).emit('round_end', { winnerId: socket.id, track: trackData, scores, word, submissions: room.submissions });

            // Win condition: reach ROUNDS_TO_WIN AND be at least 2 ahead
            // (handles deuce at 4-4, 5-5, etc.)
            const matchOver = myScore >= ROUNDS_TO_WIN && myScore - oppScore >= 2;
            if (matchOver) {
                io.to(code).emit('match_end', { winnerId: socket.id, scores });
                rooms.delete(code);
            } else {
                setTimeout(() => startRound(code), 3500);
            }
        } else {
            // ── WRONG — lock this player out for the round ──
            room.wrongPlayers.add(socket.id);
            socket.emit('submit_result', { result: 'wrong' });
            // Signal the opponent with the song that was tried
            const oppId = room.players.find(id => id !== socket.id);
            if (oppId) io.to(oppId).emit('opponent_wrong', { trackName, artist });

            // If every player is now locked out, skip to next word immediately
            if (room.wrongPlayers.size >= room.players.length) {
                room.roundActive = false;
                clearTimeout(room.timer);
                io.to(code).emit('round_skip', { word: room.word, bothWrong: true, submissions: room.submissions });
                setTimeout(() => startRound(code), 2500);
            }
        }
    });

    socket.on('disconnect', () => {
        const code = socket.roomCode;
        if (!code) return;
        const room = rooms.get(code);
        if (!room) return;
        clearTimeout(room.timer);
        io.to(code).emit('opponent_disconnected');
        rooms.delete(code);
        console.log(`Room ${code} closed — player disconnected`);
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`✅  SpotiFight running at http://localhost:${PORT}`));
