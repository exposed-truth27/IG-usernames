from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import io
import csv
import json
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ------------------------- Models -------------------------

class InstagramUser(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    profile_url: str
    profile_pic_url: str
    categories: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ParseRequest(BaseModel):
    url: str


class ParseResponse(BaseModel):
    username: str
    profile_url: str
    profile_pic_url: str


class CreateUserRequest(BaseModel):
    username: str
    profile_url: str
    profile_pic_url: str
    categories: List[str] = []


class UpdateUserRequest(BaseModel):
    profile_pic_url: Optional[str] = None
    categories: Optional[List[str]] = None


# ------------------------- Helpers -------------------------

USERNAME_RE = re.compile(r"^[A-Za-z0-9._]{1,30}$")
RESERVED_PATHS = {"p", "reel", "reels", "tv", "explore", "stories",
                  "accounts", "direct", "about"}


def extract_username_from_url(url: str) -> str:
    if not url or not isinstance(url, str):
        raise ValueError("URL is required")

    s = url.strip()
    if not s.startswith("http"):
        s = s.lstrip("@/")
        candidate = s.split("/")[0].split("?")[0]
        if USERNAME_RE.match(candidate):
            return candidate.lower()
        raise ValueError("Could not parse Instagram username from input")

    parsed = urlparse(s)
    host = (parsed.netloc or "").lower()
    if "instagram.com" not in host:
        raise ValueError("URL must be an instagram.com link")

    path_parts = [p for p in parsed.path.split("/") if p]
    if not path_parts:
        raise ValueError("URL is missing a username segment")

    candidate = path_parts[0]
    if candidate in RESERVED_PATHS:
        raise ValueError("URL does not point to a profile")
    if not USERNAME_RE.match(candidate):
        raise ValueError("Username segment is invalid")
    return candidate.lower()


def fallback_avatar(username: str) -> str:
    return (f"https://api.dicebear.com/7.x/initials/svg?seed={username}"
            f"&backgroundColor=0076B6&textColor=ffffff")


def fetch_profile_pic(username: str) -> str:
return f"https://unavatar.io/instagram/{username}?fallback={fallback_avatar(username)}"

# ------------------------- Routes -------------------------

@api_router.get("/")
async def root():
    return {"message": "Instagram List Builder API"}


@api_router.post("/instagram/parse", response_model=ParseResponse)
async def parse_instagram(payload: ParseRequest):
    try:
        username = extract_username_from_url(payload.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return ParseResponse(
        username=username,
        profile_url=f"https://www.instagram.com/{username}/",
        profile_pic_url=fetch_profile_pic(username),
    )


@api_router.get("/users", response_model=List[InstagramUser])
async def list_users():
    docs = await db.ig_users.find({}, {"_id": 0}) \
        .sort("created_at", -1).to_list(2000)
    for d in docs:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
    return docs


@api_router.post("/users", response_model=InstagramUser)
async def add_user(payload: CreateUserRequest):
    uname = payload.username.strip().lower()
    if not USERNAME_RE.match(uname):
        raise HTTPException(status_code=400, detail="Invalid username")

    existing = await db.ig_users.find_one({"username": uname}, {"_id": 0})
    if existing:
        existing_cats = set(existing.get("categories", []))
        merged = sorted(existing_cats.union(
            {c.strip() for c in payload.categories if c.strip()}))
        new_pic = payload.profile_pic_url or existing.get("profile_pic_url")
        await db.ig_users.update_one(
            {"id": existing["id"]},
            {"$set": {"categories": merged, "profile_pic_url": new_pic}},
        )
        existing["categories"] = merged
        existing["profile_pic_url"] = new_pic
        if isinstance(existing.get("created_at"), str):
            existing["created_at"] = datetime.fromisoformat(existing["created_at"])
        return existing

    obj = InstagramUser(
        username=uname,
        profile_url=payload.profile_url or f"https://www.instagram.com/{uname}/",
        profile_pic_url=payload.profile_pic_url or fallback_avatar(uname),
        categories=sorted({c.strip() for c in payload.categories if c.strip()}),
    )
    doc = obj.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.ig_users.insert_one(doc)
    return obj


@api_router.put("/users/{user_id}", response_model=InstagramUser)
async def update_user(user_id: str, payload: UpdateUserRequest):
    existing = await db.ig_users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    update = {}
    if payload.profile_pic_url is not None:
        update["profile_pic_url"] = payload.profile_pic_url
    if payload.categories is not None:
        update["categories"] = sorted(
            {c.strip() for c in payload.categories if c.strip()})

    if update:
        await db.ig_users.update_one({"id": user_id}, {"$set": update})
        existing.update(update)

    if isinstance(existing.get("created_at"), str):
        existing["created_at"] = datetime.fromisoformat(existing["created_at"])
    return existing


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str):
    res = await db.ig_users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@api_router.get("/categories", response_model=List[str])
async def list_categories():
    cats = await db.ig_users.distinct("categories")
    return sorted([c for c in cats if c])


@api_router.get("/export/json")
async def export_json():
    docs = await db.ig_users.find({}, {"_id": 0}) \
        .sort("created_at", -1).to_list(5000)
    body = json.dumps(docs, indent=2, default=str)
    return Response(content=body, media_type="application/json",
                    headers={"Content-Disposition":
                             "attachment; filename=instagram_list.json"})


@api_router.get("/export/csv")
async def export_csv():
    docs = await db.ig_users.find({}, {"_id": 0}) \
        .sort("created_at", -1).to_list(5000)
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["username", "profile_url", "profile_pic_url",
                     "categories", "created_at"])
    for d in docs:
        writer.writerow([
            d.get("username", ""),
            d.get("profile_url", ""),
            d.get("profile_pic_url", ""),
            "; ".join(d.get("categories", []) or []),
            d.get("created_at", ""),
        ])
    return Response(content=out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition":
                             "attachment; filename=instagram_list.csv"})


# ------------------------- Wiring -------------------------

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

