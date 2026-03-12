# Quinnevic — Google Ads Dashboard

A clean, responsive PWA dashboard showing Google Ads campaign performance for Quinnevic (Auckland campaigns).

## Architecture

```
Google Ads Script (daily) → Google Sheet → Apps Script JSON API → This Dashboard → Netlify
```

## Setup

### 1. Google Sheet
The data sheet is here: https://docs.google.com/spreadsheets/d/1sujF64sQA_Zx0ASCiXcvML9UhxsD5F9N-oP-LtrtErs/edit

Columns: `Date | Campaign Name | Region | Clicks | Impressions | CTR | Avg CPC | Cost | Search Impr Share | Impr Share (Top) | Impr Share (Abs Top)`

### 2. Google Ads Scripts
1. In Google Ads → Tools → Scripts → New Script
2. **Backfill (one-time):** Paste `scripts/google-ads-backfill.js`, Preview, then Run
3. **Daily export:** Paste `scripts/google-ads-script.js`, set frequency to Daily

### 3. Apps Script API
1. Open the Google Sheet → Extensions → Apps Script
2. Paste `scripts/apps-script-api.gs`
3. Deploy → New Deployment → Web App (Execute as Me, Anyone can access)
4. Copy the URL and paste it into `js/app.js` → `CONFIG.APPS_SCRIPT_URL`

### 4. Deploy to Netlify
1. Push this repo to GitHub
2. Connect to Netlify (New site → Import from Git)
3. Build command: (leave empty)
4. Publish directory: `.`
5. Done — site will auto-deploy on push

### 5. PWA Icons
Replace the SVG icons in `icons/` with proper PNG files (192×192 and 512×512) for best mobile experience. Update `manifest.json` if filenames change.

## Tech Stack
- HTML + Tailwind CSS (CDN) — no build step
- Chart.js for trend visualisation
- Service Worker for offline app shell
- Google Apps Script as free JSON API
- Netlify for hosting

## File Structure
```
index.html          — main dashboard page
css/style.css       — custom styles
js/app.js           — data fetch, aggregation, rendering
manifest.json       — PWA manifest
sw.js               — service worker
netlify.toml        — Netlify headers + config
icons/              — PWA icons
scripts/
  google-ads-script.js    — daily export (runs in Google Ads)
  google-ads-backfill.js  — one-time historical backfill
  apps-script-api.gs      — JSON API (runs in Google Sheets)
```
