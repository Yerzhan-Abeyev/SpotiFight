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
app.get('/Paradise_Found.mp3', (_req, res) => res.sendFile(path.join(__dirname, 'Paradise_Found.mp3')));

// ── GET /api/daily ────────────────────────────────────────────────────────────
function wordForDate(words, dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const pool = isWeekend ? words.weekend : words.weekday;
    let h = 0;
    for (const c of dateStr) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
    return pool[Math.abs(h) % pool.length];
}

app.get('/api/daily', (req, res) => {
    try {
        const words   = JSON.parse(readFileSync(path.join(__dirname, 'daily-words.json'), 'utf-8'));
        const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
        res.json({ word: wordForDate(words, dateStr), date: dateStr });
    } catch (err) {
        console.error('Daily word error:', err);
        res.status(500).json({ error: 'Could not load daily word' });
    }
});

// ── GET /api/daily-history ────────────────────────────────────────────────────
app.get('/api/daily-history', (req, res) => {
    try {
        const words   = JSON.parse(readFileSync(path.join(__dirname, 'daily-words.json'), 'utf-8'));
        const baseStr = req.query.date || new Date().toISOString().slice(0, 10);
        const base    = new Date(baseStr + 'T12:00:00Z');
        const history = [];
        for (let i = 5; i >= 1; i--) {
            const d = new Date(base);
            d.setUTCDate(d.getUTCDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            history.push({ date: dateStr, word: wordForDate(words, dateStr) });
        }
        res.json({ history });
    } catch (err) {
        console.error('Daily history error:', err);
        res.status(500).json({ error: 'Could not load history' });
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

// ── GET /api/deezer/preview ───────────────────────────────────────────────────
app.get('/api/deezer/preview', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ error: 'Missing query' });
        const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=1`);
        if (!r.ok) throw new Error('Deezer error');
        const data = await r.json();
        const preview = data.data?.[0]?.preview || null;
        res.json({ preview });
    } catch (err) {
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

function shuffleWords() {
    const a = [...DUEL_WORDS];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pickDuelWord(room) {
    if (!room.wordQueue || room.wordQueue.length === 0) {
        room.wordQueue = shuffleWords();   // reshuffle when exhausted
    }
    return room.wordQueue.pop();
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

const ROUNDS_TO_WIN = 6;
const ROUND_TIME_MS = 20_000;

function startRound(code) {
    const room = rooms.get(code);
    if (!room) return;

    clearTimeout(room.timer);
    const word        = pickDuelWord(room);
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

    socket.on('create_room', ({ name, userId }) => {
        let code;
        do { code = generateCode(); } while (rooms.has(code));

        rooms.set(code, {
            players:     [socket.id],
            names:       { [socket.id]: name || 'Player 1' },
            scores:      { [socket.id]: 0 },
            wordQueue:   shuffleWords(),
            userIds:     { [socket.id]: userId || null },
            word:        null,
            roundActive: false,
            timer:       null,
            roundNum:    0,
        });
        socket.join(code);
        socket.roomCode = code;
        socket.emit('room_created', { code });
        // Clean up waiting room if no opponent joins within 5 minutes
        setTimeout(() => {
            const r = rooms.get(code);
            if (r && r.players.length < 2) { rooms.delete(code); }
        }, 5 * 60 * 1000);
        console.log(`Room ${code} created by ${socket.id}`);
    });

    socket.on('join_room', ({ code, name, userId }) => {
        const room = rooms.get(code);
        if (!room)                    { socket.emit('join_error', { msg: 'Room not found.' }); return; }
        if (room.players.length >= 2) { socket.emit('join_error', { msg: 'Room is full.' });  return; }

        // Prevent the same account from playing against itself
        const creatorUserId = Object.values(room.userIds || {})[0];
        if (userId && creatorUserId && userId === creatorUserId) {
            socket.emit('join_error', { msg: 'You can\'t play against yourself.' });
            return;
        }

        room.players.push(socket.id);
        room.names[socket.id]  = name || 'Player 2';
        room.scores[socket.id] = 0;
        room.userIds[socket.id] = userId || null;
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
                room.matchEnded   = true;
                room.rematchVotes = new Set();
                io.to(code).emit('match_end', { winnerId: socket.id, scores });
                // Auto-cleanup if nobody requests rematch within 40s
                room.cleanupTimer = setTimeout(() => rooms.delete(code), 40_000);
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

    socket.on('rematch_request', () => {
        const code = socket.roomCode;
        const room = rooms.get(code);
        if (!room || !room.matchEnded) return;

        room.rematchVotes.add(socket.id);
        const oppId = room.players.find(id => id !== socket.id);
        if (oppId) io.to(oppId).emit('rematch_requested');

        if (room.rematchVotes.size >= room.players.length) {
            clearTimeout(room.cleanupTimer);
            room.matchEnded   = false;
            room.rematchVotes = null;
            Object.keys(room.scores).forEach(id => { room.scores[id] = 0; });
            room.roundNum   = 0;
            room.wordQueue  = shuffleWords();
            room.roundActive = false;
            const [p1, p2] = room.players;
            io.to(code).emit('rematch_start', {
                players: {
                    [p1]: { name: room.names[p1], score: 0 },
                    [p2]: { name: room.names[p2], score: 0 },
                },
            });
            setTimeout(() => startRound(code), 1500);
        }
    });

    socket.on('rematch_decline', () => {
        const code = socket.roomCode;
        const room = rooms.get(code);
        if (!room) return;
        clearTimeout(room.cleanupTimer);
        const oppId = room.players.find(id => id !== socket.id);
        if (oppId) io.to(oppId).emit('rematch_declined');
        rooms.delete(code);
    });

    socket.on('disconnect', () => {
        const code = socket.roomCode;
        if (!code) return;
        const room = rooms.get(code);
        if (!room) return;
        clearTimeout(room.timer);
        clearTimeout(room.cleanupTimer);

        // Grace period for mid-game disconnect
        if (room.players.length === 2 && room.roundNum > 0 && !room.matchEnded) {
            room.roundActive = false;
            room.disconnectInfo = {
                socketId: socket.id,
                userId:   room.userIds[socket.id],
                name:     room.names[socket.id],
            };
            io.to(code).emit('opponent_reconnecting', { seconds: 15 });
            room.reconnectTimer = setTimeout(() => {
                const r = rooms.get(code);
                if (!r) return;
                io.to(code).emit('opponent_disconnected');
                rooms.delete(code);
                console.log(`Room ${code} closed — reconnect timeout`);
            }, 15_000);
        } else if (room.players.length === 1 && !room.matchEnded) {
            // Creator disconnected while waiting — keep room alive so the code stays valid.
            // The 5-min cleanup timer is already running; just store reconnect info.
            room.disconnectInfo = {
                socketId: socket.id,
                userId:   room.userIds[socket.id],
                name:     room.names[socket.id],
            };
            console.log(`Room ${code}: creator disconnected while waiting — room kept alive`);
        } else {
            io.to(code).emit('opponent_disconnected');
            rooms.delete(code);
            console.log(`Room ${code} closed — player disconnected`);
        }
    });

    socket.on('rejoin_room', ({ code, userId }) => {
        const room = rooms.get(code);
        if (!room || !room.disconnectInfo) { socket.emit('rejoin_failed'); return; }

        const info = room.disconnectInfo;
        if (userId && info.userId && userId !== info.userId) { socket.emit('rejoin_failed'); return; }

        clearTimeout(room.reconnectTimer);

        const oldId = info.socketId;
        const idx   = room.players.indexOf(oldId);
        if (idx === -1) { socket.emit('rejoin_failed'); return; }

        room.players[idx]       = socket.id;
        room.names[socket.id]   = info.name;
        room.scores[socket.id]  = room.scores[oldId] || 0;
        room.userIds[socket.id] = userId || null;
        delete room.names[oldId];
        delete room.scores[oldId];
        delete room.userIds[oldId];
        delete room.disconnectInfo;
        delete room.reconnectTimer;

        socket.join(code);
        socket.roomCode = code;

        // Waiting room rejoin (game not yet started)
        if (room.roundNum === 0) {
            socket.emit('rejoin_waiting', { code });
            console.log(`Room ${code}: creator rejoined while waiting`);
            return;
        }

        const [p1, p2] = room.players;
        socket.emit('rejoin_success', {
            myId:   socket.id,
            word:   room.word,
            scores: { ...room.scores },
            players: {
                [p1]: { name: room.names[p1], score: room.scores[p1] || 0 },
                [p2]: { name: room.names[p2], score: room.scores[p2] || 0 },
            },
        });

        const oppId = room.players.find(id => id !== socket.id);
        if (oppId) io.to(oppId).emit('opponent_reconnected');

        // Resume — start a fresh round with the same word pool
        setTimeout(() => startRound(code), 1000);
        console.log(`Room ${code}: ${info.name} rejoined`);
    });
});

// ── Keep-alive (prevents free-tier sleep) ────────────────────────────────────
app.get('/ping', (_req, res) => res.send('ok'));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`✅  SpotiFight running at http://localhost:${PORT}`));
