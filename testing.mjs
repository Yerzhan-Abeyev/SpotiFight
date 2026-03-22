// genius-test.js
// Run with: node genius-test.js
//
// Tests the full Genius flow:
//   1. Search for a song
//   2. Fetch the lyrics page
//   3. Parse the lyrics
//   4. Check for a word

// ── CONFIG ────────────────────────────────────────────────────────────────────

const TRACK        = 'Glimpse of Us';
const ARTIST       = 'Joji';
const WORD         = 'fine';
// ─────────────────────────────────────────────────────────────────────────────

import { JSDOM } from 'jsdom';

async function run() {
    console.log('\n──────────────────────────────────────────');
    console.log(' Genius API Test');
    console.log(`──────────────────────────────────────────\n`);

    // ── Step 1: Search ────────────────────────────────────────────────────────
    console.log(`[1] Searching Genius for "${TRACK}" by "${ARTIST}"…`);
    const q   = `${TRACK} ${ARTIST}`;
    const url = `https://api.genius.com/search?q=${encodeURIComponent(q)}`;

    let lyricsUrl;
    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${GENIUS_TOKEN}` },
        });

        if (!res.ok) {
            console.error(`   Search failed: HTTP ${res.status} ${res.statusText}`);
            const body = await res.text();
            console.error(`    Body: ${body.slice(0, 300)}`);
            process.exit(1);
        }

        const data = await res.json();
        const hits = data.response?.hits || [];

        if (!hits.length) {
            console.error('    No results returned. Try a different track/artist.');
            process.exit(1);
        }

        console.log(`     Got ${hits.length} hit(s)`);

        // Pick the best match
        const lower = TRACK.toLowerCase();
        const best  = hits.find(h => h.result.title.toLowerCase().includes(lower.split(' ')[0]))
                      || hits[0];

        console.log(`     Best match: "${best.result.title}" by ${best.result.primary_artist.name}`);
        lyricsUrl = best.result.url;
        console.log(`    🔗 Lyrics URL: ${lyricsUrl}\n`);

    } catch (e) {
        console.error(`     Network error during search: ${e.message}`);
        process.exit(1);
    }

    // ── Step 2: Fetch lyrics page ─────────────────────────────────────────────
    console.log('[2] Fetching lyrics page…');
    let html;
    try {
        const res = await fetch(lyricsUrl, {
            headers: {
                // Mimic a real browser so Genius doesn't serve a bot-detection page
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
            },
        });

        if (!res.ok) {
            console.error(`     Page fetch failed: HTTP ${res.status} ${res.statusText}`);
            process.exit(1);
        }

        html = await res.text();
        console.log(`     Page fetched — ${html.length.toLocaleString()} chars\n`);

    } catch (e) {
        console.error(`     Network error fetching page: ${e.message}`);
        process.exit(1);
    }

    // ── Step 3: Parse lyrics ──────────────────────────────────────────────────
    console.log('[3] Parsing lyrics from HTML…');
    let lyrics;
    try {
        const dom        = new JSDOM(html);
        const doc        = dom.window.document;
        const containers = doc.querySelectorAll('[data-lyrics-container="true"]');

        if (!containers.length) {
            const title = doc.querySelector('title')?.textContent || '(no title)';
            console.error(`     No [data-lyrics-container] elements found.`);
            console.error(`       Page title: "${title}"`);
            console.error(`       Genius may have changed their HTML structure, or served a bot-detection page.`);
            process.exit(1);
        }

        console.log(`     Found ${containers.length} lyrics container(s)`);

        let raw = '';
        containers.forEach(c => {
            c.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
            raw += (c.textContent || '') + '\n';
        });
        lyrics = raw.trim();

        console.log(`     Extracted ${lyrics.length.toLocaleString()} chars, ~${lyrics.split('\n').length} lines`);
        console.log(`\n    ── Preview (first 300 chars) ──`);
        console.log('    ' + lyrics.slice(0, 300).replace(/\n/g, '\n    '));
        console.log();

    } catch (e) {
        console.error(`     Parse error: ${e.message}`);
        process.exit(1);
    }

    // ── Step 4: Word check ────────────────────────────────────────────────────
    console.log(`[4] Checking for word "${WORD}" in lyrics…`);
    const re  = new RegExp(`\\b${WORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const hit = re.test(lyrics);

    if (hit) {
        console.log(`     FOUND — "${WORD}" appears in the lyrics!\n`);
    } else {
        console.log(`     NOT FOUND — "${WORD}" does not appear in the lyrics.\n`);
    }
}

run();
