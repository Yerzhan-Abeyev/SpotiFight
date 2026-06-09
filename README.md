# DiscoClash

A music lyrics word-guessing game. A word is given — find a song where that word appears in the lyrics but **not** in the title.

**Live:** [spotifight-2.onrender.com](https://spotifight-2.onrender.com)

---

## Tech Stack

| Layer | Tools |
|-------|-------|
| Backend | Node.js, Express, Socket.io |
| Music data | [Deezer API](https://developers.deezer.com) — search, artist catalog, previews (no key needed) |
| Lyrics | [lyrics.ovh](https://lyrics.ovh) + [lrclib.net](https://lrclib.net) (dual fallback, server-side cache) |
| Auth & DB | [Supabase](https://supabase.com) — Google OAuth, profiles, scores, friends, duel invites, match history |
| Frontend | Vanilla JS, Tailwind CSS via CDN (no build step) |

---

## Setup

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/Yerzhan-Abeyev/SpotiFight.git
cd SpotiFight
npm install
```

Create a `.env` file (only needed for local dev):

```
PORT=3000
```

No third-party API keys required for music/lyrics.

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

**Supabase:** run `supabase_migration.sql` in your Supabase SQL Editor to create all required tables (profiles, scores, friends, duel invites, match history, favorites).

---

## Project Structure

```
├── server.js               # Express + Socket.io server, Deezer proxy, duel logic, daily word, lyrics cache
├── home.html               # Home — mode selector, leaderboard, profile, daily challenge, friends
├── globalmode.html         # Global mode (any song)
├── localmode.html          # Local / artist mode
├── duel.html               # Online Duel (real-time 1v1 with chat)
├── theme.css               # Light / dark theme overrides
├── daily-words.json        # Word pools for daily challenges (weekday / weekend)
├── supabase_migration.sql  # SQL to run in Supabase dashboard
└── package.json
```

---

## Security

- HTTP security headers via [Helmet](https://helmetjs.github.io)
- Content Security Policy (CSP) on all pages
- Rate limiting on all API routes (60 req/min)
- Socket.io events rate-limited per connection
- All user input sanitized and length-capped server-side
- XSS-safe rendering throughout (all user-sourced strings HTML-escaped)
- Crypto-random room codes

---

## Modes

### Global Mode
Search any song worldwide. Each round you get **3 word chips** (easy / medium / hard). Difficulty escalates every 2 rounds — one slot upgrades at a time. You score on the hardest chip that matches, plus a time bonus.

| Round | Word slots |
|-------|------------|
| 1–2   | Easy · Easy · Easy |
| 3–4   | Medium · Easy · Easy |
| 5–6   | Medium · Medium · Easy |
| 7–8   | Medium · Medium · Medium |
| 9–10  | Hard · Medium · Medium |
| 11–12 | Hard · Hard · Medium |
| 13+   | Hard · Hard · Hard |

| Difficulty | Base pts | Time bonus |
|------------|----------|------------|
| Easy       | 100      | +2 / sec   |
| Medium     | 250      | +5 / sec   |
| Hard       | 500      | +10 / sec  |

Word bank: 265 easy / 130 medium / 30 hard. One skip per game. Your **Personal Best is shown live in the HUD** — the score turns green when you're beating it. On game over a card reveals the song that ended your run.

### Local Mode
Pick an artist. The game fetches their catalog via Deezer, analyzes the lyrics, and builds a word pool from their signature vocabulary. Records tracked per artist with the same PB tracker in the HUD.

### Online Duel
Real-time 1v1 — create or join a room with a 6-character code. Both players get the same word and race to find a valid song. First to **6 rounds** with a **2-point lead** wins (deuce rule).

- Score displayed as **pip dots** (fills in as rounds are won)
- Wrong answer locks you out for that round
- Round result triggers a flash animation on the score bar
- **In-duel chat** — quick reactions (gg, 🔥, 😅, 🤝) and free-text messages during the match
- Confetti on match win; synthesized sound effects throughout
- Match history saved to your profile (last 5 duels shown)
- Rematch button at match end
- Challenge friends directly from the Friends list

### Daily Challenge
One word per day, shared across all players. You have 3 lives. Solved days tracked in a monthly calendar with streak counting.

---

## Profile

When signed in:
- Best score, games played, daily streak
- **Favorite artist** and **favorite song** (editable, shown on your public profile card)
- **Recent Duels** — last 5 match results with opponent name and score
- **Share Profile** button — downloads a profile card image (or native share on mobile)
- Friend code for adding friends
- Incoming friend requests and duel challenge notifications

---

## Social

- Add friends by username or `#FRIEND_CODE`
- See which friends are online (green dot)
- Challenge online friends to a duel from the Friends list
- Add opponent as friend from the match-over screen
- Click any leaderboard name to view their profile

---

## Sound & Audio

- **Sound effects** — synthesized via Web Audio API, no audio files. Plays on correct / wrong answers, round win/loss, match win/loss, countdown, and the 5-second timer warning.
- **Song previews** — 9–10 sec audio clip with fade-in/out after a correct answer. Sourced from Deezer. Volume adjustable and persisted across sessions.

---

## Settings

- **Theme** — dark / light mode, saved to `localStorage`
- **Volume** — vertical slider (0–100%), saved to `localStorage`
- **Calendar** — daily challenge history
- **Google sign-in** — persists scores and unlocks social features

---

## Notes

- Lyric lookups time out at 4 s and fall back across two providers. No lyrics = free retry without penalty.
- Duel uses deuce scoring: first to 6 with a minimum 2-point lead.
- Global and Daily modes work without an account. Local mode and Duel require Google sign-in.
