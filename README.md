# 🌐 Borderless HR Agent

An AI-powered global HR assistant built with FastAPI + Claude API. Inspired by Borderless AI's HRGPT/Alberni product — helps HR teams navigate global employment law, EOR decisions, payroll compliance, and more.

## Features

- 💬 Conversational HR assistant with multi-turn memory
- 🌍 Global employment knowledge (contracts, terminations, notice periods)
- 📋 EOR vs. entity setup guidance
- 💼 Payroll, benefits, and compliance queries
- ⚡ Clean chat UI with suggested prompts

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI, Python |
| AI | Anthropic Claude (claude-sonnet-4-6) |
| Frontend | Vanilla HTML/CSS/JS |

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/borderless-hr-agent.git
cd borderless-hr-agent/backend
pip install -r requirements.txt
```

### 2. Set API key

```bash
export ANTHROPIC_API_KEY=your_key_here
```

### 3. Run backend

```bash
uvicorn main:app --reload
# API available at http://localhost:8000
```

### 4. Open frontend

Open `frontend/index.html` in your browser (or serve with `python -m http.server`).

## API

### `POST /chat`

```json
{
  "messages": [
    { "role": "user", "content": "What are the notice period rules for terminating an employee in Canada?" }
  ]
}
```

**Response:**
```json
{
  "reply": "In Canada, notice periods vary by province and employment duration..."
}
```

## Example Queries

- *"How do I hire a full-time employee in Germany without setting up an entity?"*
- *"What are the termination notice requirements in the UK?"*
- *"Compare EOR vs. PEO for a 5-person team in Brazil."*
- *"What statutory benefits are required for employees in Singapore?"*

## Project Structure

```
borderless-hr-agent/
├── backend/
│   ├── main.py          # FastAPI app + Claude integration
│   └── requirements.txt
└── frontend/
    └── index.html       # Chat UI
```

## Author

**Quan Nguyen** — AI/ML Engineer  
[LinkedIn](https://linkedin.com/in/quan-nguyen-8a13a9328/) | [GitHub](https://github.com/Khuong-Quan-Nguyen)
