from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from anthropic import Anthropic

app = FastAPI(title="Borderless HR Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Anthropic()

SYSTEM_PROMPT = """You are an AI HR assistant for a global employer of record (EOR) platform, 
similar to Borderless AI. You help HR teams and employees with:

- Global employment law questions (contracts, terminations, notice periods)
- Payroll and compensation queries across countries
- Employee onboarding and offboarding processes
- Benefits administration and compliance
- Work permit and visa eligibility questions
- EOR vs. entity setup trade-offs

Be concise, accurate, and always note when a question requires legal counsel for the specific jurisdiction.
When you don't know a country-specific rule, say so rather than guess.
Format responses clearly with bullet points where helpful."""

class ChatRequest(BaseModel):
    messages: list[dict]

class ChatResponse(BaseModel):
    reply: str

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=req.messages,
    )
    return ChatResponse(reply=response.content[0].text)

@app.get("/health")
def health():
    return {"status": "ok"}
