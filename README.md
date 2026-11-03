# 🌐 Borderless HR Agent

An AI HR agent for global teams, built with FastAPI and Claude. It's inspired by [Borderless AI](https://www.hireborderless.com), an AI-native Employer of Record whose agent **Alberni** handles compliance questions, contract drafting and onboarding, and whose free **HRGPT** search engine pulls new users in at the top of the funnel.

> Independent portfolio project. Not affiliated with or endorsed by Borderless AI.

## Features

| | What it does |
|---|---|
| ⚡ **One-prompt hire** *(new)* | Describe a hire in one sentence. A Claude tool-use agent compares candidate countries using the Planner's cost data, picks one, drafts the contract and builds an onboarding checklist. Each step streams into a live timeline. A link like `/#hire?q=…` runs the agent automatically. |
| 💬 **HR Agent** | Multi-turn chat for employment law, payroll, benefits, visas, contractor misclassification and EOR-vs-entity questions. Responses stream in and are rendered as Markdown. |
| 📄 **Contract drafting** | Produces a first-draft employment or contractor agreement for a chosen country, including local clauses (probation, leave, notice, IP), `[REVIEW]` markers for counsel and placeholders for missing details. You can copy it or download it as Markdown. |
| 🌍 **Global Hiring Planner** | Compares the **true annual cost** of a hire in up to 4 countries: gross pay including mandatory extra months, employer contributions and EOR fees. Each country also shows paid leave, notice, probation and contractor-misclassification risk. It can generate an **AI hiring brief** with a recommendation, and every plan is a **shareable link**. |

### Why the Hiring Planner?

Borderless already grows through free tools: HRGPT, and a free agent the CEO compared to Zillow's Zestimate. The Planner applies the same idea to the moment a buyer is choosing **where** to hire. That's the point where an EOR is most relevant.

- **Captures high-intent buyers.** Someone comparing employer costs in Germany and Brazil is about to make a hire.
- **Spreads by sharing.** Plans are links, so HR sends them to finance and the hiring manager, and new stakeholders see the product.
- **Hands off to the product.** The AI brief ends with next steps (EOR vs. contractor vs. entity), which leads naturally into onboarding.

### How the one-prompt hire agent works

`POST /api/hire` runs a manual tool-use loop with Claude, and the response streams back as newline-delimited JSON events. Claude has three tools:

| Tool | What the server does |
|---|---|
| `compare_countries` | Runs the same cost formula as the Planner (`api/countries.py`), so the recommendation is based on the data rather than the model's memory |
| `draft_contract` | Makes a nested Claude call with the contract prompt and streams the draft to the UI. Claude only gets back a short confirmation, which keeps its context small |
| `create_onboarding_plan` | Takes a structured checklist (`when`, `task`, `owner`) from Claude and renders it as interactive checkboxes |

All three tools use `strict: true`, so their inputs always match the schema.

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
│   ├── index.py        # FastAPI app: /api/hire (agent), /api/chat, /api/contract, /api/brief, /api/countries, /api/health
│   └── countries.py    # Indicative cost/compliance data for 24 countries + cost formula
├── public/
│   ├── index.html      # Landing page + app (HR Agent · Contracts · Hiring Planner)
│   ├── styles.css
│   └── app.js
├── requirements.txt
└── vercel.json
```

## Run the demo locally

### Prerequisites

- **Python 3.10+.** Check with `python --version`.
- **An Anthropic API key.** Create one at [console.anthropic.com](https://console.anthropic.com/settings/keys).
- **Git.**

### 1. Clone the repo

```bash
git clone https://github.com/Khuong-Quan-Nguyen/borderless-hr-agent.git
cd borderless-hr-agent
```

### 2. Create a virtual environment and install dependencies

**Windows (PowerShell):**
```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**macOS / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Add your API key

Create a file named `.env` in the project root (next to `requirements.txt`):

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

`.env` is git-ignored, so your key is never committed.

### 4. Start the app

```bash
uvicorn api.index:app --reload
```

One server runs both the API and the website. Open **http://localhost:8000**. When the app is ready, the green **Agent online** dot shows in the top-right of the workspace.

Stop the server with `Ctrl + C`. Next time, you only need to run step 2's `activate` line and then step 4.

### 5. Try the demo

1. **One-prompt hire tab.** Click an example, such as *Backend engineer · Portugal or Poland*, or describe your own hire. Watch the agent go through four steps: it compares countries (the recommended one is highlighted), streams the contract draft, builds the onboarding checklist and writes a summary. A full run takes about 90 seconds.
1. **HR Agent tab.** Click a suggestion card, such as *Hire in Germany*, or ask your own question, for example *"What's the notice period for firing someone in France after 2 years?"* Follow-up questions keep the conversation context.
2. **Contracts tab.** Choose *Employee*, pick a country (for example Portugal), enter a job title and salary, then click **Generate draft**. Clauses that need a lawyer's check are marked **[REVIEW]**. Use **Copy** or **Download .md** to export the draft.
3. **Hiring Planner tab.** This is the new feature.
   - Set a role and salary, then add or remove countries (up to 4). Costs update instantly, and the cheapest country is tagged **Lowest cost**.
   - Click **✦ Generate AI hiring brief** for a written recommendation.
   - Click **Copy share link**, then open the link in a new tab. The same comparison loads.

AI responses take a few seconds to start, because the model reasons before it answers. Then the text streams in.

### Troubleshooting

| Problem | Fix |
|---|---|
| Status dot says **Backend offline**, or the page doesn't load | Make sure `uvicorn` is still running in your terminal and you opened `http://localhost:8000`, not the HTML file directly. |
| Answers say the **API key is missing or invalid** | Check that `.env` is in the project root and contains `ANTHROPIC_API_KEY=...`, then restart `uvicorn`. |
| `uvicorn: command not found` | The virtual environment isn't active. Run the `activate` line from step 2. |
| Port 8000 is already in use | Run `uvicorn api.index:app --reload --port 8001` and open http://localhost:8001. |
| `.venv\Scripts\activate` is blocked on Windows | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once in PowerShell, then try again. |

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
