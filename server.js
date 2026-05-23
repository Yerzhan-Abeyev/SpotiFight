import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false,   // CDN scripts (Tailwind, Supabase) need inline allowed
    crossOriginEmbedderPolicy: false,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
});

// ── Static files ──────────────────────────────────────────────────────────────
const HTML_FILES = ['home.html', 'globalmode.html', 'localmode.html', 'duel.html', 'test.html'];
HTML_FILES.forEach(f => {
    app.get(`/${f}`, (_req, res) => res.sendFile(path.join(__dirname, f)));
});
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/Paradise_Found.mp3', (_req, res) => res.sendFile(path.join(__dirname, 'Paradise_Found.mp3')));
app.get('/theme.css', (_req, res) => res.sendFile(path.join(__dirname, 'theme.css')));

// ── Date validation helper ────────────────────────────────────────────────────
function safeDate(raw) {
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
}

// ── GET /api/daily ────────────────────────────────────────────────────────────
function wordForDate(words, dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const pool = isWeekend ? words.weekend : words.weekday;
    let h = 0;
    for (const c of dateStr) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
    return pool[Math.abs(h) % pool.length];
}

app.get('/api/daily', apiLimiter, (req, res) => {
    try {
        const words   = JSON.parse(readFileSync(path.join(__dirname, 'daily-words.json'), 'utf-8'));
        const dateStr = safeDate(req.query.date);
        res.json({ word: wordForDate(words, dateStr), date: dateStr });
    } catch (err) {
        console.error('Daily word error:', err);
        res.status(500).json({ error: 'Could not load daily word' });
    }
});

// ── GET /api/daily-history ────────────────────────────────────────────────────
app.get('/api/daily-history', apiLimiter, (req, res) => {
    try {
        const words   = JSON.parse(readFileSync(path.join(__dirname, 'daily-words.json'), 'utf-8'));
        const baseStr = safeDate(req.query.date);
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

// ── GET /api/deezer/search ────────────────────────────────────────────────────
app.get('/api/deezer/search', apiLimiter, async (req, res) => {
    try {
        const q     = String(req.query.q || '').slice(0, 200);
        const type  = req.query.type === 'artist' ? 'artist' : 'track';
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 8, 1), 50);
        if (!q) return res.status(400).json({ error: 'Missing query' });
        const endpoint = type === 'artist' ? 'search/artist' : 'search/track';
        const r = await fetch(`https://api.deezer.com/${endpoint}?q=${encodeURIComponent(q)}&limit=${limit}`);
        if (!r.ok) throw new Error(`Deezer error: ${r.status}`);
        const data = await r.json();
        res.json(data.data || []);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/deezer/artist/:id/top ───────────────────────────────────────────
app.get('/api/deezer/artist/:id/top', apiLimiter, async (req, res) => {
    try {
        const id = String(req.params.id).replace(/[^0-9]/g, '');
        if (!id) return res.status(400).json({ error: 'Invalid artist id' });
        const r = await fetch(`https://api.deezer.com/artist/${id}/top?limit=50`);
        if (!r.ok) throw new Error(`Deezer error: ${r.status}`);
        const data = await r.json();
        res.json(data.data || []);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/deezer/preview ───────────────────────────────────────────────────
app.get('/api/deezer/preview', apiLimiter, async (req, res) => {
    try {
        const q = String(req.query.q || '').slice(0, 200);
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

    // 1. lyrics.ovh
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch(
            `https://api.lyrics.ovh/v1/${encodeURIComponent(art)}/${encodeURIComponent(title)}`,
            { signal: ctrl.signal }
        );
        clearTimeout(t);
        if (res.ok) {
            const data = await res.json();
            if (data.lyrics) return data.lyrics;
        }
    } catch { /* fall through */ }

    // 2. lrclib.net
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch(
            `https://lrclib.net/api/get?artist_name=${encodeURIComponent(art)}&track_name=${encodeURIComponent(title)}`,
            { signal: ctrl.signal }
        );
        clearTimeout(t);
        if (res.ok) {
            const data = await res.json();
            if (data.plainLyrics) return data.plainLyrics;
        }
    } catch { /* fall through */ }

    return null;
}

function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function sanitizeName(raw) {
    return String(raw || '').replace(/[<>"'&]/g, '').slice(0, 32).trim() || 'Player';
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
            names:       { [socket.id]: sanitizeName(name) },
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
        if (room.disconnectInfo)      { socket.emit('join_error', { msg: 'Room not found.' }); return; }

        // Prevent the same account from playing against itself
        const creatorUserId = Object.values(room.userIds || {})[0];
        if (userId && creatorUserId && userId === creatorUserId) {
            socket.emit('join_error', { msg: 'You can\'t play against yourself.' });
            return;
        }

        room.players.push(socket.id);
        room.names[socket.id]  = sanitizeName(name);
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

    socket.on('submit_song', async ({ trackName, artist }) => {
        const code = socket.roomCode;
        const room = rooms.get(code);
        if (!room || !room.roundActive) return;

        // Per-socket rate limit: ignore submissions faster than 500ms
        const now = Date.now();
        if (socket._lastSubmit && now - socket._lastSubmit < 500) return;
        socket._lastSubmit = now;

        // Player already got a wrong answer this round — ignore
        if (room.wrongPlayers.has(socket.id)) return;

        // Sanitize incoming strings
        const safeTrack  = String(trackName  || '').slice(0, 200);
        const safeArtist = String(artist || '').slice(0, 200);

        const word = room.word;

        // Word in title — not a lockout, just a reminder
        if (wordInText(word, safeTrack)) {
            socket.emit('submit_result', { result: 'word_in_title' });
            return;
        }

        // Record this submission (past the title check, so it's a real attempt)
        room.submissions[socket.id] = { trackName: safeTrack, artist: safeArtist };

        // Fetch lyrics server-side — timer keeps running during this
        const lyrics = await fetchLyricsServer(safeTrack, safeArtist);

        // Guard: round may have expired or word changed while awaiting lyrics
        if (!room.roundActive || room.word !== word) return;

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

            // Emit only server-verified track info — never trust client trackData
            io.to(code).emit('round_end', { winnerId: socket.id, track: { title: safeTrack, artist: safeArtist }, scores, word, submissions: room.submissions });

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
            if (oppId) io.to(oppId).emit('opponent_wrong', { trackName: safeTrack, artist: safeArtist });

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
