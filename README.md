# SpotiFight

A music lyrics word-guessing game powered by Spotify. A word is given, find a song where that word appears in the lyrics but not in the title. One wrong answer and the game is over.

## Modes

### Global Songs
Search any song on Spotify. The word must be hidden in the lyrics, not in the title.
Difficulty scales with your streak, unlocking harder words and higher point multipliers.

| Streak | Difficulty | Points |
|--------|------------|--------|
| 0 – 6  | Easy       | 100 pts |
| 7 – 11 | Medium     | 250 pts |
| 12+    | Hard       | 500 pts + time bonus |

### Local Songs
Pick an artist. The game analyzes their catalog and builds a word pool from their lyrics.
Every session is unique to the artist, their signature words, their themes.
Search any song from their full Spotify catalog during gameplay. The word just needs to appear in the lyrics — it can also be in the title.

### Duel Mode
Real-time 1v1 — create or join a room with a 4-letter code. Both players get the same word and race to find a valid song. First to **6 points** with a **2-point lead** wins.

- Wrong answer locks you out for the round; your opponent sees what you picked.
- Round ends when one player answers correctly, both get it wrong, or the 20-second timer runs out.
- A short Spotify/Deezer preview plays after each correct answer.
- Scores are shown live throughout the match.

### Daily Challenge
One word per day, the same for every player. Solved days are tracked in your calendar.

## Song Previews

After a correct answer in any mode, a 9–10 second audio preview of the chosen song plays automatically. Previews come from Spotify's `preview_url`; if unavailable, the Deezer API is used as a fallback.

## Personal Records

- **Global mode:** your all-time best score and streak are saved and shown before each game.
- **Local mode:** each artist has their own record, displayed in the artist bar during play.

Records are stored locally in the browser via `localStorage`.

## Tech

- Node.js + Express backend
- Socket.io for real-time duel matchmaking and gameplay
- Spotify Web API (Client Credentials flow), token served by the backend, credentials never exposed to the browser
- [Deezer API](https://developers.deezer.com) as a free preview fallback (no key required)
- [lyrics.ovh](https://lyrics.ovh) for lyric verification
- Vanilla JS, no frontend framework
- Tailwind CSS via CDN

## Setup

### Prerequisites
- Node.js 18+
- A Spotify developer app, create one at [developer.spotify.com](https://developer.spotify.com)

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
├── server.js          # Express + Socket.io server, Spotify token proxy, duel logic, daily word API
├── home.html          # Landing page, mode selection, daily challenge
├── globalmode.html    # Global mode
├── localmode.html     # Local mode
├── duel.html          # Duel mode (real-time 1v1)
├── daily-words.json   # Word pools for daily challenges (weekday / weekend)
├── .env               # Credentials, never committed
└── package.json
```

## Notes

- Spotify's track search API rejects limits above 5 per request from server-side calls. Local mode works around this by running 6 parallel searches with different query terms and deduplicating results.
- Lyric verification is best-effort and capped at 1 second server-side. If lyrics cannot be found, the player is warned and the round resumes without penalty.
- Duel mode win condition uses deuce-style scoring: first to 6 points with a minimum 2-point lead.
