# SpotiFight

A music lyrics word-guessing game. A word is given — find a song where that word appears in the lyrics but **not** in the title. One wrong answer ends the game.

## Modes

### Global Songs
Search any song. The word must be hidden in the lyrics, not in the title.
Difficulty scales with your streak, unlocking harder words and higher point multipliers.

| Streak | Difficulty | Points |
|--------|------------|--------|
| 0 – 6  | Easy       | 100 pts |
| 7 – 11 | Medium     | 250 pts |
| 12+    | Hard       | 500 pts + time bonus |

### Local Songs
Pick an artist. The game fetches their top tracks via Deezer, analyzes the lyrics, and builds a word pool from their signature vocabulary. Every session is unique to the artist and their themes.

### Duel Mode
Real-time 1v1 — create or join a room with a 6-character code. Both players get the same word and race to find a valid song. First to **6 points** with a **2-point lead** wins (deuce rule).

- Wrong answer locks you out for the round; your opponent sees what you picked.
- Round ends when one player answers correctly, both get it wrong, or the 20-second timer runs out.
- A short audio preview plays after each correct answer.
- Scores are shown live throughout the match.

### Daily Challenge
One word per day, shared across all players. Solved days are tracked in a calendar. You have 3 attempts before the challenge locks for the day.

## Song Previews

After a correct answer, a 9–10 second audio preview plays automatically with a fade-in/out effect and a brief radio-static intro. Previews are sourced from the Deezer API. Volume is adjustable via the volume control and persisted across sessions.

## Personal Records

- **Global mode:** all-time best score and streak, shown before each game.
- **Local mode:** per-artist record, displayed in the artist bar during play.

Records are stored in the browser via `localStorage` and synced to Supabase when signed in.

## Settings

A controls panel in the top-right corner provides:

- **Theme toggle** — switch between dark and light mode with a gradual transition. Preference is saved to `localStorage`.
- **Volume control** — a vertical slider sets preview volume (0–100%). Saved to `localStorage`.
- **Calendar** — opens the daily challenge history.
- **Google sign-in** — authenticate to persist scores.

## Security

- HTTP security headers via [Helmet](https://helmetjs.github.io)
- Rate limiting on all API routes (60 requests/min)
- All user-supplied inputs are sanitized and length-capped server-side
- Socket.io events rate-limited per connection (500ms cooldown on song submissions)

## Tech

- Node.js + Express backend
- Socket.io for real-time duel matchmaking and gameplay
- [Deezer API](https://developers.deezer.com) for track search, artist top tracks, and previews — no API key required
- [lyrics.ovh](https://lyrics.ovh) for lyric verification
- Supabase for Google OAuth, user profiles, and score persistence
- Vanilla JS, no frontend framework
- Tailwind CSS via CDN

## Setup

### Prerequisites
- Node.js 18+

### Install

```bash
git clone https://github.com/Yerzhan-Abeyev/DiscoClash.git
cd DiscoClash
npm install
```

### Environment

Create a `.env` file in the project root:

```
PORT=3000
```

No API keys required — Deezer is open and lyrics.ovh requires no auth.

### Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
├── server.js          # Express + Socket.io server, Deezer proxy, duel logic, daily word API
├── home.html          # Landing page, mode selection, daily challenge modal
├── globalmode.html    # Global mode
├── localmode.html     # Local mode
├── duel.html          # Duel mode (real-time 1v1)
├── theme.css          # Light/dark theme overrides and transition styles
├── daily-words.json   # Word pools for daily challenges (weekday / weekend)
├── .env               # Optional: PORT override
└── package.json
```

## Notes

- Lyric verification is capped at 1 second server-side. If lyrics cannot be found, the player is warned and may retry without penalty.
- Duel mode uses deuce-style scoring: first to 6 points with a minimum 2-point lead.
- Local and Duel modes require a Supabase account (Google sign-in). Global mode and Daily Challenge are playable without signing in.
