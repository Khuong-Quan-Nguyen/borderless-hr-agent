# 🌐 Borderless HR Agent

An AI HR agent for global teams, built with FastAPI and Claude. It's inspired by [Borderless AI](https://www.hireborderless.com), an AI-native Employer of Record whose agent **Alberni** handles compliance questions, contract drafting and onboarding, and whose free **HRGPT** search engine pulls new users in at the top of the funnel.

> Independent portfolio project. Not affiliated with or endorsed by Borderless AI.

## Features

| | What it does |
|---|---|
| 💬 **HR Agent** | Multi-turn chat for employment law, payroll, benefits, visas, contractor misclassification and EOR-vs-entity questions. Responses stream in and are rendered as Markdown. |
| 📄 **Contract drafting** | Produces a first-draft employment or contractor agreement for a chosen country, including local clauses (probation, leave, notice, IP), `[REVIEW]` markers for counsel and placeholders for missing details. You can copy it or download it as Markdown. |
| 🌍 **Global Hiring Planner** *(new feature)* | Compares the **true annual cost** of a hire in up to 4 countries: gross pay including mandatory extra months, employer contributions and EOR fees. Each country also shows paid leave, notice, probation and contractor-misclassification risk. It can generate an **AI hiring brief** with a recommendation, and every plan is a **shareable link**. |

### Why the Hiring Planner?

Borderless already grows through free tools: HRGPT, and a free agent the CEO compared to Zillow's Zestimate. The Planner applies the same idea to the moment a buyer is choosing **where** to hire. That's the point where an EOR is most relevant.

- **Captures high-intent buyers.** Someone comparing employer costs in Germany and Brazil is about to make a hire.
- **Spreads by sharing.** Plans are links, so HR sends them to finance and the hiring manager, and new stakeholders see the product.
- **Hands off to the product.** The AI brief ends with next steps (EOR vs. contractor vs. entity), which leads naturally into onboarding.

## Tech stack

| Layer | Tech |
|---|---|
| Backend | FastAPI (Python), streaming responses |
| AI | Anthropic Claude (`claude-opus-5-5` by default, overridable with `CLAUDE_MODEL`) |
| Frontend | Vanilla HTML/CSS/JS, marked + DOMPurify for Markdown |
| Hosting | Vercel (static `public/` + Python function `api/index.py`) |

## Project structure

```
├── api/
│   ├── index.py        # FastAPI app: /api/chat, /api/contract, /api/brief, /api/countries, /api/health
│   └── countries.py    # Indicative cost/compliance data for 24 countries + cost formula
├── public/
│   ├── index.html      # Landing page + app (HR Agent · Contracts · Hiring Planner)
│   ├── styles.css
│   └── app.js
├── requirements.txt
└── vercel.json
```

## Run locally

```bash
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

Create `.env` in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Start the server. It serves both the API and the frontend:

```bash
uvicorn api.index:app --reload
```

Then open http://localhost:8000.

## Deploy to Vercel

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new). Use the defaults; no build command is needed.
2. Under **Settings → Environment Variables**, add `ANTHROPIC_API_KEY`. You can also set `CLAUDE_MODEL` to change the model.
3. Deploy. `public/` is served from Vercel's CDN, and every `/api/*` request goes to the FastAPI function (see `vercel.json`).

Or use the CLI: `npm i -g vercel && vercel --prod`.

> ⚠️ A public deployment spends your Anthropic credits whenever anyone uses it. Before sharing the URL widely, consider adding a spend limit in the Anthropic Console, or Vercel's firewall rate limiting.

## API

All AI endpoints stream back `text/plain` Markdown.

| Endpoint | Body |
|---|---|
| `POST /api/chat` | `{"messages": [{"role": "user", "content": "..."}]}` |
| `POST /api/contract` | `{"country": "Portugal", "worker_type": "employee", "role": "Designer", "salary": "...", "start_date": "...", "company": "...", "notes": "..."}` |
| `POST /api/brief` | `{"countries": ["GB", "DE"], "salary_usd": 90000, "eor_fee": 500, "role": "..."}` |
| `GET /api/countries` | Planner dataset |
| `GET /api/health` | `{"status": "ok", "model": "..."}` |

## Disclaimer

The country figures in `api/countries.py` are simplified planning estimates. Real costs depend on salary caps, region, residency and collective agreements. Nothing this app produces is legal or tax advice.

## Author

**Quan Nguyen**, AI/ML Engineer
[LinkedIn](https://linkedin.com/in/quan-nguyen-8a13a9328/) | [GitHub](https://github.com/Khuong-Quan-Nguyen)
