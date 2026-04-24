# Product #7 — Contact Center After-Call Work (ACW) Automation
**Priority:** Build SIXTH (30-45 days, $5-20K/mo ceiling)
**Model:** Per-seat SaaS $30/seat/mo, minimum 20 seats

---

## The Problem
After every customer call, contact center agents spend 6+ minutes doing "After-Call Work" (ACW) — writing call summaries, tagging the issue type, updating CRM notes, and logging next steps. At a 500-seat contact center, that's 50 hours of wasted labor EVERY HOUR of operation. Fujitsu cut ACW from 6.3 → 3.1 minutes with AI — that's a 50% reduction, millions saved per year.

## The Buyer
Contact center managers at companies with 50-500 agents. They have a direct P&L line for ACW time — they can calculate ROI immediately. $30/seat/mo = $1,500/mo for a 50-seat team = trivial vs. $50K/yr in saved labor.

---

## Tech Stack
- **Chrome extension:** Captures audio from browser-based dialers (Aircall, JustCall, Twilio Flex, Five9 Web)
- **Audio processing:** WebAudio API → MediaRecorder → upload to backend
- **Transcription:** Deepgram API ($0.0043/min — cheapest accurate option)
- **Summarization:** Claude Haiku API (fast, cheap, accurate summaries)
- **CRM push:** HubSpot API + Salesforce API (v1: HubSpot only)
- **Backend:** FastAPI on Railway
- **Database:** Supabase
- **Billing:** Stripe ($30/seat/mo)
- **Total cost:** $30/mo + usage

---

## How It Works
1. Agent finishes call → Chrome extension detects call end
2. Extension sends recording to backend (or transcribes in-browser)
3. Deepgram transcribes in ~10 seconds
4. Claude generates: 3-sentence summary + issue category + sentiment + next steps
5. Pre-filled CRM form appears in a side panel — agent reviews in 30 seconds, clicks "Save"
6. Data pushed to HubSpot/Salesforce automatically
7. ACW time: 6 minutes → 45 seconds

---

## 30-Day Day-by-Day Plan

### Week 1 — Core Extension (Days 1-7)
- **Day 1:** Set up Chrome extension boilerplate. Detect Aircall web app in active tab.
- **Day 2:** Capture audio using Chrome's `tabCapture` API when call is active
- **Day 3:** On call end → upload audio to backend → Deepgram transcription
- **Day 4:** Send transcript to Claude Haiku → structured summary JSON (summary, category, sentiment, next_steps)
- **Day 5:** Build side panel UI in extension — shows pre-filled summary, editable fields
- **Day 6:** Build "Save to HubSpot" button — creates/updates contact + adds note via HubSpot API
- **Day 7:** End-to-end test with real Aircall calls

### Week 2 — Product Polish (Days 8-14)
- **Day 8:** Add custom category taxonomy — admin sets issue categories for their team
- **Day 9:** Add quality scoring — Claude rates call quality 1-5 + flags coaching opportunities
- **Day 10:** Build manager dashboard — average ACW time, summary quality scores, agent leaderboard
- **Day 11:** Add Salesforce integration (Activity logging)
- **Day 12:** Set up Stripe billing — per-seat monthly
- **Day 13:** Build onboarding flow — connect dialer + CRM in 5 minutes
- **Day 14:** Test with 3 beta users (contact center managers from LinkedIn)

### Week 3 — Launch (Days 15-21)
- **Day 15:** Cold email 50 contact center managers on LinkedIn: "Cut your ACW time by 50% — free 14-day trial"
- **Day 16:** Post on r/ContactCenter, r/CustomerSuccess
- **Day 17:** LinkedIn content: "I analyzed 1,000 after-call work workflows — here's what's wasting your agents' time"
- **Day 18:** Reach out to Aircall, JustCall partner programs — get listed as integration
- **Day 19:** Post in "Contact Center Professionals" LinkedIn group (50K members)
- **Day 20:** Cold email Aircall/JustCall customers (find on G2 reviews)
- **Day 21:** First paying team

### Week 4 — Scale (Days 22-30)
- Add: Zendesk ticket creation from call summary
- Add: Whisper Jukebox model fine-tuning on customer-specific call taxonomy
- Target: 3 teams × 50 seats × $30 = $4,500 MRR

---

## Sales Approach
This is B2B with a longer sales cycle — but ROI is immediately calculable:

**The ROI pitch:**
- Average agent salary: $35K/yr = $17/hr
- ACW reduction: 3 min/call × 100 calls/day = 300 min/day = 5 hrs/day
- Per agent savings: 5 hrs × $17 = $85/day = $1,700/mo per agent
- Your price: $30/seat/mo
- ROI: **56× return on investment**

Lead with this math. Every contact center manager will pay $30/seat when you show them $1,700/seat in savings.

---

## Distribution
1. **Cold email contact center managers** — title: "VP Operations", "Contact Center Manager", "Customer Success Director". Find on LinkedIn Sales Navigator (or Apollo.io free).
2. **Aircall/JustCall partner programs** — they list integrations, thousands of their customers see you
3. **G2/Capterra** — list and get reviews fast, contact center managers research here
4. **LinkedIn content** — "ACW is killing your contact center efficiency" posts get shared by ops people
5. **Direct outreach to Aircall's top customers** — their reviews on G2 name company names

---

## Revenue Model
| Plan | Price | Min seats |
|---|---|---|
| Starter | $30/seat/mo | 20 seats ($600/mo min) |
| Growth | $25/seat/mo | 100 seats ($2,500/mo min) |
| Enterprise | $20/seat/mo | 500+ seats (custom contract) |

**Revenue targets:**
- Month 1: 2 teams × 50 seats = $3K MRR
- Month 2: 5 teams = $7.5K MRR
- Month 3: 10 teams = $15K MRR
- Month 6: 30 teams = $45K MRR

---

## Costs
| Item | Cost/mo |
|---|---|
| Railway hosting | $20 |
| Deepgram API | $0.0043/min × 10K min = $43 |
| Claude Haiku API | ~$5 per 1K summaries |
| Supabase | $0-25 |
| **Total** | **~$70-90/mo** |

---

## Moat
- Custom category taxonomies per customer = switching cost
- Quality scoring data compounds per team (benchmarks improve)
- Manager dashboard creates org-level buy-in (not just agent-level)
- First-mover in Aircall/JustCall ecosystems = partner channel locked in
