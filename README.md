# SpotiFight

A music lyrics word-guessing game powered by Spotify. A word is given — find a song where that word appears in the lyrics but not in the title. One wrong answer and the game is over.

## Modes

### Global Songs
Search any song on Spotify. The word must be hidden in the lyrics — not in the title.
Difficulty scales with your streak, unlocking harder words and higher point multipliers.

| Streak | Difficulty | Points |
|--------|------------|--------|
| 0 – 6  | Easy       | 100 pts |
| 7 – 11 | Medium     | 250 pts |
| 12+    | Hard       | 500 pts + time bonus |

### Local Songs
Pick an artist. The game analyzes their catalog and builds a word pool from their lyrics.
Every session is unique to the artist — their signature words, their themes.
Search any song from their full Spotify catalog during gameplay.

### Daily Challenge
One word per day, the same for every player. Solved days are tracked in your calendar.

## Personal Records

- **Global mode** — your all-time best score and streak are saved and shown before each game.
- **Local mode** — each artist has their own record, displayed in the artist bar during play.

Records are stored locally in the browser via `localStorage`.

## Tech

- Node.js + Express backend
- Spotify Web API (Client Credentials flow) — token served by the backend, credentials never exposed to the browser
- [lyrics.ovh](https://lyrics.ovh) for lyric verification
- Vanilla JS, no frontend framework
- Tailwind CSS via CDN

## Setup

### Prerequisites
- Node.js 18+
- A Spotify developer app — create one at [developer.spotify.com](https://developer.spotify.com)

### Install

```bash
git clone https://github.com/Yerzhan-Abeyev/DiscoClash.git
cd DiscoClash
npm install
```

### Environment

Create a `.env` file in the project root:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
PORT=3000
```

### Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
├── server.js          # Express server, Spotify token proxy, daily word API
├── home.html          # Landing page — mode selection, daily challenge
├── index.html         # Global mode
├── artist.html        # Local mode
├── daily-words.json   # Word pools for daily challenges (weekday / weekend)
├── .env               # Credentials — never committed
└── package.json
```

## Notes

- Spotify's track search API rejects limits above 5 per request from server-side calls. Local mode works around this by running 6 parallel searches with different query terms and deduplicating results.
- Lyric verification is best-effort — if lyrics cannot be found for a song, the player is warned and the round resumes without penalty.
