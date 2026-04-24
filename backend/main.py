"""
ACW Assistant — FastAPI Backend

Handles call transcript summarization via Claude Haiku,
summary storage in SQLite, and CORS for the Chrome extension.

Run: uvicorn main:app --reload
"""

import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import anthropic
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import create_engine, desc
from sqlalchemy.orm import Session, sessionmaker

from models import Base, CallSummary

# ─── Environment ──────────────────────────────────────────────────────────────

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./acw_summaries.db")

if not ANTHROPIC_API_KEY:
    raise RuntimeError(
        "ANTHROPIC_API_KEY is not set. Add it to your .env file."
    )

# ─── Database ─────────────────────────────────────────────────────────────────

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── Anthropic Client ─────────────────────────────────────────────────────────

anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ─── Lifespan ─────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ACW Assistant API",
    description="After-Call Work automation via Claude Haiku",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "chrome-extension://*",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────


class SummarizeRequest(BaseModel):
    transcript: str = Field(
        default="",
        description="Raw call transcript text",
        max_length=100_000,
    )
    duration: int = Field(
        default=0,
        ge=0,
        le=86_400,
        description="Call duration in seconds",
    )
    agent_id: str = Field(
        default="unknown",
        min_length=1,
        max_length=128,
        description="Unique agent identifier",
    )

    @field_validator("agent_id")
    @classmethod
    def sanitize_agent_id(cls, v: str) -> str:
        return v.strip()


class SummarizeResponse(BaseModel):
    summary: str
    sentiment: str
    action_items: list[str]
    category: str
    quality_score: Optional[float]


class SaveSummaryRequest(BaseModel):
    agent_id: str = Field(min_length=1, max_length=128)
    transcript: str = Field(default="", max_length=100_000)
    summary: str = Field(min_length=1, max_length=5000)
    sentiment: str = Field(default="neutral")
    action_items: list[str] = Field(default_factory=list)
    category: str = Field(default="general", max_length=128)
    duration: int = Field(default=0, ge=0)
    quality_score: Optional[float] = Field(default=None, ge=0, le=5)

    @field_validator("sentiment")
    @classmethod
    def validate_sentiment(cls, v: str) -> str:
        allowed = {"positive", "negative", "neutral"}
        normalized = v.lower().strip()
        return normalized if normalized in allowed else "neutral"


class SummaryRecord(BaseModel):
    id: int
    agent_id: str
    transcript: str
    summary: str
    sentiment: str
    action_items: list[str]
    category: str
    duration: int
    quality_score: Optional[float]
    created_at: str

    model_config = {"from_attributes": True}


# ─── Summarization Logic ──────────────────────────────────────────────────────

SUMMARIZE_SYSTEM_PROMPT = """You are an expert contact center analyst. Your job is to analyze call transcripts and produce structured after-call work (ACW) summaries.

Always respond with valid JSON matching this exact schema:
{
  "summary": "<3 concise sentences describing the call>",
  "sentiment": "<one of: positive, negative, neutral>",
  "action_items": ["<action 1>", "<action 2>"],
  "category": "<one of: billing, technical_support, account_management, complaint, sales, general_inquiry, returns, onboarding, other>",
  "quality_score": <float 1.0-5.0 rating call quality, or null if insufficient data>
}

Rules:
- summary: exactly 2-3 sentences, factual, no filler words
- sentiment: based on customer tone throughout the call
- action_items: only concrete next steps (empty list if none)
- category: pick the single best match
- quality_score: 1=poor, 3=average, 5=excellent handling"""


def build_user_prompt(transcript: str, duration: int) -> str:
    duration_str = f"{duration // 60}m {duration % 60}s" if duration > 0 else "unknown"
    transcript_section = (
        transcript.strip() if transcript.strip()
        else "[No transcript available — generate summary based on call metadata only]"
    )
    return f"""Call Duration: {duration_str}

Transcript:
{transcript_section}

Generate the ACW summary JSON now."""


async def generate_summary(
    transcript: str, duration: int
) -> SummarizeResponse:
    """Calls Claude Haiku to generate a structured call summary."""
    user_prompt = build_user_prompt(transcript, duration)

    message = anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=SUMMARIZE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw_text = message.content[0].text.strip()

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        # Extract JSON block if wrapped in markdown code fences
        import re
        json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if not json_match:
            raise ValueError(f"Claude returned non-JSON response: {raw_text[:200]}")
        parsed = json.loads(json_match.group())

    sentiment = parsed.get("sentiment", "neutral").lower()
    if sentiment not in {"positive", "negative", "neutral"}:
        sentiment = "neutral"

    quality_score = parsed.get("quality_score")
    if quality_score is not None:
        try:
            quality_score = max(1.0, min(5.0, float(quality_score)))
        except (TypeError, ValueError):
            quality_score = None

    return SummarizeResponse(
        summary=str(parsed.get("summary", "Call summary unavailable.")),
        sentiment=sentiment,
        action_items=[str(item) for item in parsed.get("action_items", [])],
        category=str(parsed.get("category", "general")),
        quality_score=quality_score,
    )


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
async def health_check():
    """Health check endpoint used by the Chrome extension popup."""
    return {"status": "ok", "version": "1.0.0"}


@app.post(
    "/api/summarize",
    response_model=SummarizeResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate an AI call summary",
)
async def summarize_call(
    request: SummarizeRequest,
    db: Session = Depends(get_db),
):
    """
    Accepts a call transcript and duration, generates a structured summary
    via Claude Haiku, persists it to the database, and returns the result.
    """
    try:
        result = await generate_summary(request.transcript, request.duration)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI summarization failed: {exc}",
        ) from exc

    record = CallSummary(
        agent_id=request.agent_id,
        transcript=request.transcript,
        summary=result.summary,
        sentiment=result.sentiment,
        action_items_json=json.dumps(result.action_items),
        category=result.category,
        duration=request.duration,
        quality_score=result.quality_score,
        created_at=datetime.now(timezone.utc),
    )
    db.add(record)
    db.commit()

    return result


@app.get(
    "/api/summaries",
    response_model=list[SummaryRecord],
    summary="List recent call summaries",
)
def list_summaries(
    agent_id: Optional[str] = Query(default=None, max_length=128),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Returns recent call summaries, optionally filtered by agent_id.
    Ordered by most recent first.
    """
    query = db.query(CallSummary).order_by(desc(CallSummary.created_at))

    if agent_id:
        query = query.filter(CallSummary.agent_id == agent_id.strip())

    records = query.offset(offset).limit(limit).all()
    return [SummaryRecord(**r.to_dict()) for r in records]


@app.post(
    "/api/summaries",
    response_model=SummaryRecord,
    status_code=status.HTTP_201_CREATED,
    summary="Save a call summary manually",
)
def save_summary(
    request: SaveSummaryRequest,
    db: Session = Depends(get_db),
):
    """
    Saves a call summary directly without AI generation.
    Useful for manual overrides or CRM-pushed summaries.
    """
    record = CallSummary(
        agent_id=request.agent_id,
        transcript=request.transcript,
        summary=request.summary,
        sentiment=request.sentiment,
        action_items_json=json.dumps(request.action_items),
        category=request.category,
        duration=request.duration,
        quality_score=request.quality_score,
        created_at=datetime.now(timezone.utc),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return SummaryRecord(**record.to_dict())


@app.get(
    "/api/summaries/{summary_id}",
    response_model=SummaryRecord,
    summary="Get a single call summary by ID",
)
def get_summary(
    summary_id: int,
    db: Session = Depends(get_db),
):
    """Returns a single call summary by its database ID."""
    record = db.query(CallSummary).filter(CallSummary.id == summary_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Summary {summary_id} not found",
        )
    return SummaryRecord(**record.to_dict())


@app.delete(
    "/api/summaries/{summary_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a call summary",
)
def delete_summary(
    summary_id: int,
    db: Session = Depends(get_db),
):
    """Deletes a single call summary by ID."""
    record = db.query(CallSummary).filter(CallSummary.id == summary_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Summary {summary_id} not found",
        )
    db.delete(record)
    db.commit()
