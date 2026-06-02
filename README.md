# SpotiFight

A music lyrics word-guessing game. A word is given — find a song where that word appears in the lyrics but **not** in the title.

## Modes

### Global Songs
Search any song worldwide. Difficulty scales with your streak, unlocking harder words and higher point multipliers. You get **one skip per game** if you're stuck.

| Streak | Difficulty | Base Points |
|--------|------------|-------------|
| 0 – 6  | Easy       | 100 pts     |
| 7 – 11 | Medium     | 250 pts     |
| 12+    | Hard       | 500 pts + time bonus |

Word bank: 265 easy / 130 medium / 30 hard words.

### Local Songs
Pick an artist. The game fetches their catalog via Deezer, analyzes the lyrics, and builds a word pool from their signature vocabulary. Records are tracked per-artist.

### Online Duel
Real-time 1v1 — create or join a room with a 6-character code. Both players get the same word and race to find a valid song. First to **6 rounds** with a **2-point lead** wins (deuce rule).

- Score displayed as **pip dots** (fills in as rounds are won)
- Wrong answer locks you out for that round
- Round result triggers a flash animation and pop on the winner's side
- Confetti on match win; synthesized sound effects throughout
- Match history saved to your profile (last 5 duels shown)
- Rematch button at match end
- Challenge friends directly from the Friends list

### Daily Challenge
One word per day, shared across all players. You have 3 lives. Solved days tracked in a monthly calendar with streak counting. Past days can be replayed (not counted).

## Profile

When signed in, your profile panel shows:
- Best score, games played, daily streak
- **Favorite artist** and **favorite song** (editable, auto-saved)
- **Recent Duels** — last 5 match results with opponent name and score
- **Share Profile** button — generates a profile card image (downloads or uses native share on mobile)
- Friend code for adding friends
- Incoming friend requests and duel challenge notifications

## Social

- Add friends by username or `#FRIEND_CODE`
- See which friends are online (green dot)
- Challenge online friends to a duel directly from the Friends list
- Add opponent as friend from the match-over screen

## Sound Effects

Synthesized via Web Audio API — no audio files. Sounds play for:
correct answers, wrong answers, round win/loss, match win/loss, countdown beeps, and the 5-second timer warning ticks.

## Song Previews

After a correct answer a 9–10 second audio preview plays with fade-in/out and a brief radio-static intro. Sourced from Deezer. Volume adjustable and persisted across sessions.

## Settings

- **Theme toggle** — dark / light mode, saved to `localStorage`
- **Volume control** — vertical slider (0–100%), saved to `localStorage`
- **Calendar** — daily challenge history
- **Google sign-in** — persists scores and unlocks social features

## Security

- HTTP security headers via [Helmet](https://helmetjs.github.io)
- Content Security Policy (CSP) on all pages
- Rate limiting on all API routes (60 req/min)
- Socket.io events rate-limited per connection (500 ms cooldown)
- All user input sanitized and length-capped server-side
- Crypto-random room codes

## Tech

- Node.js + Express backend
- Socket.io for real-time duel matchmaking and gameplay
- [Deezer API](https://developers.deezer.com) — track search, artist catalog, previews (no key required)
- [lyrics.ovh](https://lyrics.ovh) + [lrclib.net](https://lrclib.net) for lyric verification (dual fallback)
- [Supabase](https://supabase.com) — Google OAuth, profiles, scores, friends, duel invites, match history
- Vanilla JS, no frontend framework
- Tailwind CSS via CDN

## Setup

### Prerequisites
Node.js 18+

### Install

```bash
git clone https://github.com/Yerzhan-Abeyev/DiscoClash.git
cd DiscoClash
npm install
```

### Environment

Create a `.env` file:

```
PORT=3000
```

No third-party API keys required.

### Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

### Supabase

Run `supabase_migration.sql` in your Supabase SQL Editor to create the required tables and columns (includes friend system, duel invites, duel history, and profile favorites).

## Project Structure

```
├── server.js               # Express + Socket.io server, Deezer proxy, duel logic, daily word API
├── home.html               # Landing page, mode selection, daily challenge, friends, profile panel
├── globalmode.html         # Global mode
├── localmode.html          # Local / artist mode
├── duel.html               # Online Duel (real-time 1v1)
├── theme.css               # Light/dark theme overrides
├── daily-words.json        # Word pools for daily challenges (weekday / weekend)
├── supabase_migration.sql  # SQL to run in Supabase dashboard
├── .env                    # Optional: PORT override
└── package.json
```

## Notes

- Lyric lookup times out at 1.5 s with a fallback to lrclib.net. If neither source finds lyrics the player may retry without penalty.
- Duel mode uses deuce-style scoring: first to 6 with a minimum 2-point lead.
- Local and Duel modes require Google sign-in. Global mode and Daily Challenge are playable without an account.
