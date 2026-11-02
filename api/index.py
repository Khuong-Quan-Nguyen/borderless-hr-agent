import os
import sys
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
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


async def stream_claude(system: str, messages: list[dict], effort: str):
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
    except anthropic.AuthenticationError:
        yield "⚠️ The server's Anthropic API key is missing or invalid. Set `ANTHROPIC_API_KEY`."
    except anthropic.RateLimitError:
        yield "⚠️ Too many requests right now. Please try again in a minute."
    except anthropic.APIStatusError as e:
        yield f"⚠️ The AI service returned an error ({e.status_code}). Please try again."
    except anthropic.APIConnectionError:
        yield "⚠️ Could not reach the AI service. Please try again."


def text_stream(gen) -> StreamingResponse:
    return StreamingResponse(gen, media_type="text/plain; charset=utf-8",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if req.messages[0].role != "user":
        raise HTTPException(400, "Conversation must start with a user message")
    messages = [m.model_dump() for m in req.messages]
    return text_stream(stream_claude(CHAT_PROMPT, messages, effort="low"))


@app.post("/api/contract")
async def contract(req: ContractRequest):
    details = "\n".join(f"- {k.replace('_', ' ').title()}: {v}" for k, v in req.model_dump().items() if v)
    prompt = f"Draft the agreement using these details:\n{details}"
    return text_stream(stream_claude(CONTRACT_PROMPT, [{"role": "user", "content": prompt}], effort="medium"))


@app.post("/api/brief")
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


@app.get("/api/countries")
def countries():
    return COUNTRIES


@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL}


# Local development: serve the frontend from the same origin. On Vercel, public/ is served by the CDN.
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "..", "public")
if os.path.isdir(PUBLIC_DIR):
    app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="public")
