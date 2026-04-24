# ACW Assistant

AI-powered After-Call Work automation for contact centers.
Reduces agent ACW time from 6 minutes to 30 seconds.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Chrome Browser                       │
│                                                          │
│   ┌────────────────┐      ┌────────────────────────┐     │
│   │  content.js    │─────▶│   background.js        │     │
│   │  (dialer page) │      │   (service worker)     │     │
│   │                │      │   - receives CALL_ENDED │     │
│   │ Detects call   │      │   - calls /api/summarize│     │
│   │ end signals    │      │   - stores in local DB  │     │
│   │ via DOM        │      │   - shows notification  │     │
│   └────────────────┘      └──────────┬─────────────┘     │
│                                      │                   │
│   ┌────────────────┐      ┌──────────▼─────────────┐     │
│   │  popup.html    │      │   dashboard.html        │     │
│   │  popup.js      │      │   dashboard.js          │     │
│   │                │      │                         │     │
│   │ Status badge   │      │ Summary list + stats    │     │
│   │ Toggle switch  │      │ Reads chrome.storage    │     │
│   └────────────────┘      └─────────────────────────┘    │
└──────────────────────────────────┬───────────────────────┘
                                   │ HTTP (fetch)
                                   ▼
┌──────────────────────────────────────────────────────────┐
│               FastAPI Backend (Railway / local)           │
│                                                          │
│   POST /api/summarize  ──▶  Claude Haiku (Anthropic)     │
│   GET  /api/summaries  ──▶  SQLite / PostgreSQL          │
│   GET  /api/dashboard  ──▶  Aggregate stats              │
│   GET  /health         ──▶  { status: "ok" }             │
└──────────────────────────────────────────────────────────┘
```

## Quick Start — Run Backend Locally

**Prerequisites:** Python 3.11+, an Anthropic API key.

```bash
cd backend

# 1. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment variables
cp .env .env.local               # or edit .env directly
# Set ANTHROPIC_API_KEY=sk-ant-...

# 4. Start the server
uvicorn main:app --reload

# Server runs at http://localhost:8000
# Interactive docs at http://localhost:8000/docs
```

## Quick Start — Load Extension in Chrome (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repository
5. Pin the **ACW Assistant** extension to your toolbar
6. Click the extension icon — the popup shows the backend connection status

The extension works on any page that matches a browser-based dialer
(Aircall, JustCall, Twilio Flex, Five9 Web, etc.).

## Deploy Backend to Railway

**Prerequisites:** A [Railway](https://railway.app) account and the Railway CLI.

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Create a new project and link it
cd backend
railway init

# 4. Set the required environment variable
railway variables set ANTHROPIC_API_KEY=sk-ant-...

# 5. Deploy (uses Dockerfile automatically via railway.json)
railway up

# 6. Get the public URL
railway domain
```

The `railway.json` in `backend/` configures the build to use the `Dockerfile`
and starts the server on the `$PORT` provided by Railway.

Once deployed, update `BACKEND_URL` in `extension/popup.js` and
`extension/background.js` to your Railway URL before publishing the extension.

## Project Structure

```
contact-center-acw/
├── backend/
│   ├── main.py            FastAPI app — endpoints, CORS, Anthropic calls
│   ├── models.py          SQLAlchemy ORM model (CallSummary)
│   ├── requirements.txt   Python dependencies
│   ├── Dockerfile         For Railway deployment
│   ├── railway.json       Railway build + deploy config
│   └── .env               Environment variables (never commit secrets)
├── extension/
│   ├── manifest.json      Chrome Extension Manifest v3
│   ├── popup.html         Extension popup UI
│   ├── popup.js           Popup logic (status check, toggle, preview)
│   ├── background.js      Service worker (call detection → backend → storage)
│   ├── content.js         DOM observer for call-end detection
│   ├── dashboard.html     Full-page summaries dashboard
│   ├── dashboard.js       Dashboard rendering from chrome.storage.local
│   └── icons/             Extension icons (16, 48, 128 px)
├── landing/
│   └── index.html         Marketing landing page with ROI calculator
└── README.md              This file
```

## Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check — `{ status: "ok", version: "1.0.0" }` |
| POST | `/api/summarize` | Generate AI summary from transcript |
| GET | `/api/summaries` | List stored summaries (paginated) |
| GET | `/api/dashboard` | Aggregate stats for manager view |
| POST | `/api/summaries` | Save a summary manually |
| DELETE | `/api/summaries/{id}` | Delete a summary by ID |
