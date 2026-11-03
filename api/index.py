import json
import logging
import os
import sys
import time
from collections import defaultdict, deque
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import anthropic

sys.path.insert(0, os.path.dirname(__file__))
from countries import BY_CODE, COUNTRIES, estimate_cost  # noqa: E402

load_dotenv()

app = FastAPI(title="Borderless HR Agent API")
client = anthropic.AsyncAnthropic()

MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-5-5")
MAX_MESSAGES = 40
MAX_CHARS = 8000

BASE_PROMPT = """You are an AI HR agent for a global employer of record (EOR) platform. You help HR,
finance and founders hire, pay and manage people in other countries without setting up entities.

Be concise and practical. Use Markdown: short headings, bullet points and tables where they help.
Flag when a question needs local legal counsel, and say so plainly when you are unsure of a
country-specific rule instead of guessing. Figures you give are estimates unless the user supplied them."""

CHAT_PROMPT = BASE_PROMPT + """

You cover global employment law (contracts, terminations, notice periods), payroll and
compensation, onboarding/offboarding, benefits, time off, work permits and visas, contractor
misclassification, and EOR vs. entity trade-offs."""

COUNTRY_FACTS = "\n".join(
    f"- {c['name']} ({c['currency']}): employer contributions ~{c['employer_rate']:.1%}, mandatory extra pay "
    f"{c['extra_months']} months, min. paid leave {c['pto_days']} days, notice: {c['notice']}, probation: {c['probation']}, "
    f"contractor misclassification risk: {c['misclass_risk']}; {c['notes']}"
    for c in COUNTRIES)
CHAT_PROMPT += f"""

The platform's indicative country data is below. When a question touches these countries, use these figures so
your answers match the Hiring Planner, and mention that the user can compare countries in the Hiring Planner tab or
run the full workflow in the One-prompt hire tab when they are deciding where to hire.
{COUNTRY_FACTS}"""

CONTRACT_PROMPT = BASE_PROMPT + """

Draft a first-draft employment agreement (or contractor agreement) for the country given. Include the
clauses that jurisdiction requires or customarily expects (probation, working hours, statutory leave,
notice, governing law, IP assignment, confidentiality, data protection). Mark anything that must be
checked by local counsel with **[REVIEW]**, use [PLACEHOLDER] brackets for missing details, and
start with a one-paragraph summary of key local requirements. Output only the document."""

BRIEF_PROMPT = BASE_PROMPT + """

You are writing a hiring brief that compares countries for a hire. You are given indicative cost and
compliance data computed by the platform; rely on it and do not invent different numbers. Structure:
1. **Recommendation** (one or two sentences naming the best-fit country and why)
2. **Cost comparison** (a short table)
3. **Compliance watch-outs** per country (2-3 bullets each)
4. **Hiring model** (EOR vs. contractor vs. entity for this situation, with the misclassification risk)
5. **Next steps** (3 bullets)
Keep it under 450 words."""


HIRE_PROMPT = BASE_PROMPT + """

You are running the one-prompt hire workflow. The user describes a hire in plain language and you take
it from "where should we hire?" to "ready to onboard" using your tools, in this order:
1. Call `compare_countries` with every candidate country (pick 2-4 sensible ones if the user named none,
   or a region). Convert the salary to USD if needed and say so. Default the EOR fee to 500 USD/month.
2. Pick the best-fit country using the tool data (cost, notice, misclassification risk), not memory.
3. Call `draft_contract` for that country. Use "contractor" only if the user explicitly asked for one.
4. Call `create_onboarding_plan` with a concrete checklist for that country (documents, payroll and tax
   registration, benefits, equipment, statutory items), each with a timing relative to the start date.
Then write a short final summary (under 200 words, Markdown): the decision and why in two sentences, a
one-line cost figure, the top 3 compliance watch-outs, and what the user should do next. Do not repeat
the contract or the checklist; the user already sees them. If the request is not about hiring, say what
the workflow does instead of calling tools."""

CODES = [c["code"] for c in COUNTRIES]

HIRE_TOOLS = [
    {
        "name": "compare_countries",
        "description": ("Compare the indicative total annual employer cost and compliance profile of one hire across "
                        "1-4 countries, using the platform's country data. Returns cost breakdown, paid leave, notice, "
                        "probation and contractor-misclassification risk per country."),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "country_codes": {"type": "array", "items": {"type": "string", "enum": CODES},
                                  "description": "ISO country codes to compare (1-4)."},
                "salary_usd": {"type": "number", "description": "Base annual salary in USD."},
                "eor_fee_monthly_usd": {"type": "number", "description": "EOR fee per month in USD."},
            },
            "required": ["country_codes", "salary_usd", "eor_fee_monthly_usd"],
            "additionalProperties": False,
        },
    },
    {
        "name": "draft_contract",
        "description": ("Draft a first-draft employment or contractor agreement for the chosen country. The draft is "
                        "shown to the user directly; you receive a short confirmation."),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "country_code": {"type": "string", "enum": CODES},
                "worker_type": {"type": "string", "enum": ["employee", "contractor"]},
                "role": {"type": "string"},
                "salary": {"type": "string", "description": "Salary as it should appear in the contract, with currency."},
                "start_date": {"type": "string", "description": "Start date, or empty if unknown."},
                "special_terms": {"type": "string", "description": "Remote work, equity, etc. Empty if none."},
            },
            "required": ["country_code", "worker_type", "role", "salary", "start_date", "special_terms"],
            "additionalProperties": False,
        },
    },
    {
        "name": "create_onboarding_plan",
        "description": "Save the onboarding checklist for the hire. It is shown to the user as an interactive checklist.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "country_code": {"type": "string", "enum": CODES},
                "items": {
                    "type": "array",
                    "description": "6-12 checklist items in chronological order.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "when": {"type": "string", "description": "Timing, e.g. 'Week -3', 'Day 1', 'First 90 days'."},
                            "task": {"type": "string"},
                            "owner": {"type": "string", "enum": ["Employer", "EOR", "Employee"]},
                        },
                        "required": ["when", "task", "owner"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["country_code", "items"],
            "additionalProperties": False,
        },
    },
]

MAX_AGENT_TURNS = 8

# Per-IP budget for AI calls so a public demo link can't drain the API key. In-memory, so on serverless
# it applies per warm instance - a speed bump, not a hard quota.
RATE_WINDOW_S = 600
RATE_BUDGET = int(os.getenv("RATE_BUDGET", "40"))
_usage: dict[str, deque] = defaultdict(deque)


def rate_limit(cost: int):
    def check(request: Request):
        ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
        now = time.monotonic()
        hits = _usage[ip]
        while hits and now - hits[0][0] > RATE_WINDOW_S:
            hits.popleft()
        if sum(c for _, c in hits) + cost > RATE_BUDGET:
            raise HTTPException(429, "You've hit the demo's usage limit. Please try again in a few minutes.")
        hits.append((now, cost))
    return Depends(check)


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_CHARS)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=MAX_MESSAGES)


class ContractRequest(BaseModel):
    country: str = Field(max_length=80)
    worker_type: Literal["employee", "contractor"] = "employee"
    role: str = Field(max_length=120)
    salary: str = Field(default="", max_length=60)
    start_date: str = Field(default="", max_length=40)
    company: str = Field(default="", max_length=120)
    notes: str = Field(default="", max_length=1000)


class BriefRequest(BaseModel):
    countries: list[str] = Field(min_length=1, max_length=4)
    salary_usd: float = Field(gt=0, le=2_000_000)
    eor_fee: float = Field(ge=0, le=5000)
    role: str = Field(default="", max_length=120)


class HireRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)


NO_KEY_MESSAGE = ("⚠️ The server has no Anthropic API key. Set `ANTHROPIC_API_KEY` in your environment "
                  "(on Vercel: Project → Settings → Environment Variables), then redeploy.")


def api_key_configured() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))


async def stream_claude(system: str, messages: list[dict], effort: str):
    if not api_key_configured():
        yield NO_KEY_MESSAGE
        return
    try:
        async with client.beta.messages.stream(
            model=MODEL,
            max_tokens=16000,
            system=system,
            messages=messages,
            output_config={"effort": effort},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            async for text in stream.text_stream:
                yield text
            final = await stream.get_final_message()
            if final.stop_reason == "refusal":
                yield "\n\n_I can't help with that request. Try rephrasing it as an HR or employment question._"
            elif final.stop_reason == "max_tokens":
                yield "\n\n_(Response truncated.)_"
    except Exception as e:
        yield error_message(e)


def error_message(e: Exception) -> str:
    if isinstance(e, anthropic.AuthenticationError):
        return "⚠️ The server's Anthropic API key is missing or invalid. Set `ANTHROPIC_API_KEY`."
    if isinstance(e, anthropic.RateLimitError):
        return "⚠️ Too many requests right now. Please try again in a minute."
    if isinstance(e, anthropic.BadRequestError):
        logging.error("Claude API rejected the request: %s", e.message)
        return f"⚠️ The AI service rejected the request: {e.message[:300]}"
    if isinstance(e, anthropic.APIStatusError):
        return f"⚠️ The AI service returned an error ({e.status_code}). Please try again."
    if isinstance(e, anthropic.APIConnectionError):
        return "⚠️ Could not reach the AI service. Please try again."
    logging.exception("Unexpected error while streaming from Claude")
    return "⚠️ Something went wrong on the server. Please try again."


def text_stream(gen) -> StreamingResponse:
    return StreamingResponse(gen, media_type="text/plain; charset=utf-8",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/chat", dependencies=[rate_limit(1)])
async def chat(req: ChatRequest):
    if req.messages[0].role != "user":
        raise HTTPException(400, "Conversation must start with a user message")
    messages = [m.model_dump() for m in req.messages]
    return text_stream(stream_claude(CHAT_PROMPT, messages, effort="low"))


@app.post("/api/contract", dependencies=[rate_limit(3)])
async def contract(req: ContractRequest):
    details = "\n".join(f"- {k.replace('_', ' ').title()}: {v}" for k, v in req.model_dump().items() if v)
    prompt = f"Draft the agreement using these details:\n{details}"
    return text_stream(stream_claude(CONTRACT_PROMPT, [{"role": "user", "content": prompt}], effort="medium"))


@app.post("/api/brief", dependencies=[rate_limit(2)])
async def brief(req: BriefRequest):
    unknown = [c for c in req.countries if c not in BY_CODE]
    if unknown:
        raise HTTPException(400, f"Unknown country codes: {', '.join(unknown)}")
    rows = []
    for code in req.countries:
        c = BY_CODE[code]
        cost = estimate_cost(c, req.salary_usd, req.eor_fee)
        rows.append(
            f"- {c['name']}: total annual cost ${cost['total']:,} (gross pay ${cost['gross_pay']:,}, "
            f"employer contributions ${cost['employer_taxes']:,} at ~{c['employer_rate']:.1%}, EOR fees ${cost['eor_fees']:,}); "
            f"min. paid leave {c['pto_days']} days; notice: {c['notice']}; probation: {c['probation']}; "
            f"contractor misclassification risk: {c['misclass_risk']}; notes: {c['notes']}"
        )
    role = req.role or "an unspecified role"
    prompt = (f"Hire: {role}, base salary ${req.salary_usd:,.0f} USD/year, EOR fee ${req.eor_fee:,.0f}/month.\n"
              f"Countries under consideration:\n" + "\n".join(rows))
    return text_stream(stream_claude(BRIEF_PROMPT, [{"role": "user", "content": prompt}], effort="medium"))


def ndjson(**fields) -> str:
    return json.dumps(fields, ensure_ascii=False) + "\n"


def compare_rows(codes: list[str], salary_usd: float, eor_fee: float) -> list[dict]:
    keys = ("code", "name", "currency", "employer_rate", "extra_months", "pto_days", "notice", "probation",
            "misclass_risk", "notes")
    return [{**{k: BY_CODE[code][k] for k in keys}, **estimate_cost(BY_CODE[code], salary_usd, eor_fee)}
            for code in codes]


async def run_tool(tool):
    """Execute one tool call. Yields UI events, then a final ("result", content) tuple for Claude."""
    inp = tool.input
    if tool.name == "compare_countries":
        codes = list(dict.fromkeys(c for c in inp["country_codes"] if c in BY_CODE))[:4]
        if not codes or not inp["salary_usd"] > 0:
            raise ValueError("Give 1-4 known country codes and a positive salary.")
        fee = max(0, inp["eor_fee_monthly_usd"])
        rows = compare_rows(codes, inp["salary_usd"], fee)
        yield ndjson(t="tool_result", id=tool.id, name=tool.name,
                     data={"rows": rows, "salary_usd": inp["salary_usd"], "eor_fee": fee})
        yield ("result", json.dumps(rows))

    elif tool.name == "draft_contract":
        country = BY_CODE[inp["country_code"]]["name"]
        details = {"country": country, "worker_type": inp["worker_type"], "role": inp["role"], "salary": inp["salary"],
                   "start_date": inp["start_date"], "notes": inp["special_terms"]}
        prompt = "Draft the agreement using these details:\n" + "\n".join(
            f"- {k.replace('_', ' ').title()}: {v}" for k, v in details.items() if v)
        text = ""
        async for chunk in stream_claude(CONTRACT_PROMPT, [{"role": "user", "content": prompt}], effort="low"):
            text += chunk
            yield ndjson(t="contract_delta", id=tool.id, d=chunk)
        if text.startswith("⚠️"):
            raise ValueError(text)
        yield ndjson(t="tool_result", id=tool.id, name=tool.name,
                     data={"country": country, "worker_type": inp["worker_type"], "role": inp["role"]})
        yield ("result", f"Drafted the {inp['worker_type']} agreement for {country} ({len(text.split())} words, "
                         f"{text.count('[REVIEW]')} clauses marked [REVIEW]). It is shown to the user.")

    elif tool.name == "create_onboarding_plan":
        country = BY_CODE[inp["country_code"]]["name"]
        yield ndjson(t="tool_result", id=tool.id, name=tool.name, data={"country": country, "items": inp["items"]})
        yield ("result", f"Saved a {len(inp['items'])}-item onboarding checklist for {country}. It is shown to the user.")

    else:
        raise ValueError(f"Unknown tool {tool.name}")


async def run_hire(prompt: str):
    if not api_key_configured():
        yield ndjson(t="error", msg=NO_KEY_MESSAGE)
        return
    messages = [{"role": "user", "content": prompt}]
    try:
        for _ in range(MAX_AGENT_TURNS):
            async with client.beta.messages.stream(
                model=MODEL,
                max_tokens=16000,
                system=HIRE_PROMPT,
                tools=HIRE_TOOLS,
                messages=messages,
                output_config={"effort": "low"},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            ) as stream:
                async for ev in stream:
                    if ev.type == "content_block_start" and ev.content_block.type == "tool_use":
                        yield ndjson(t="tool_start", id=ev.content_block.id, name=ev.content_block.name)
                    elif ev.type == "content_block_delta" and ev.delta.type == "text_delta":
                        yield ndjson(t="text", d=ev.delta.text)
                final = await stream.get_final_message()

            if final.stop_reason == "refusal":
                yield ndjson(t="error", msg="I can't help with that request. Try describing a hire instead.")
                return
            if final.stop_reason == "max_tokens":
                yield ndjson(t="text", d="\n\n_(Response truncated.)_")
                break
            tool_uses = [b for b in final.content if b.type == "tool_use"]
            if not tool_uses:
                break

            messages.append({"role": "assistant", "content": final.content})
            results = []
            for tool in tool_uses:
                yield ndjson(t="tool_call", id=tool.id, name=tool.name, input=tool.input)
                result = {"type": "tool_result", "tool_use_id": tool.id}
                try:
                    async for item in run_tool(tool):
                        if isinstance(item, tuple):
                            result["content"] = item[1]
                        else:
                            yield item
                except (KeyError, TypeError, ValueError) as e:
                    result.update(content=f"Error: {e}", is_error=True)
                    yield ndjson(t="tool_error", id=tool.id, name=tool.name, msg=str(e))
                results.append(result)
            messages.append({"role": "user", "content": results})
        yield ndjson(t="done")
    except Exception as e:
        yield ndjson(t="error", msg=error_message(e))


@app.post("/api/hire", dependencies=[rate_limit(6)])
async def hire(req: HireRequest):
    return StreamingResponse(run_hire(req.prompt), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/countries")
def countries():
    return COUNTRIES


@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL, "api_key_configured": api_key_configured()}


# Local development: serve the frontend from the same origin. On Vercel, public/ is served by the CDN.
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "..", "public")
if os.path.isdir(PUBLIC_DIR):
    app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="public")
