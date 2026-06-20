from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated

import bcrypt
import jwt
import httpx
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def to_str_id(v):
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)


PyObjectId = Annotated[str, BeforeValidator(to_str_id)]
JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class CategoryIn(BaseModel):
    name: str


class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    user_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ProfileIn(BaseModel):
    url_or_username: str
    category_ids: List[str] = []


class BulkItem(BaseModel):
    url_or_username: str
    category_names: List[str] = []


class BulkIn(BaseModel):
    items: List[BulkItem]


class ProfileUpdate(BaseModel):
    category_ids: Optional[List[str]] = None


class Profile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    full_name: Optional[str] = None
    profile_pic_url: Optional[str] = None
    is_verified: Optional[bool] = False
    bio: Optional[str] = None
    category_ids: List[str] = []
    user_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {"id": str(user["_id"]), "email": user["email"], "role": user.get("role", "user")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


USERNAME_RE = re.compile(r"^[A-Za-z0-9._]+$")


def extract_username(raw: str) -> Optional[str]:
    if not raw:
        return None
    s = raw.strip().split("?")[0].split("#")[0]
    m = re.search(r"instagram\.com/(?:p/|reel/|reels/|stories/)?([A-Za-z0-9._]+)", s, re.IGNORECASE)
    if m:
        return m.group(1).lstrip("@")
    s = s.lstrip("@").rstrip("/")
    if USERNAME_RE.match(s):
        return s
    return None


async def fetch_instagram_profile(username: str) -> dict:
    host = os.environ.get("RAPIDAPI_HOST", "instagram-api-fast-reliable-data-scraper.p.rapidapi.com")
    key = os.environ.get("RAPIDAPI_KEY", "")
    url = f"https://{host}/profile"
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": key}
    try:
        async with httpx.AsyncClient(timeout=20.0) as cx:
            r = await cx.get(url, params={"username": username}, headers=headers)
            if r.status_code != 200:
                logger.warning(f"RapidAPI {r.status_code} for {username}: {r.text[:200]}")
                return {}
            data = r.json()
    except Exception as e:
        logger.exception(f"RapidAPI fetch error: {e}")
        return {}

    candidates = [data, data.get("data"), data.get("user"), (data.get("data") or {}).get("user")]
    profile = next((c for c in candidates if isinstance(c, dict) and (c.get("username") or c.get("full_name") or c.get("profile_pic_url"))), {})

    pic = profile.get("profile_pic_url_hd") or profile.get("profile_pic_url")
    hd_info = profile.get("hd_profile_pic_url_info")
    if not pic and isinstance(hd_info, dict):
        pic = hd_info.get("url")

    return {
        "username": profile.get("username") or username,
        "full_name": profile.get("full_name") or profile.get("name") or "",
        "profile_pic_url": pic or "",
        "is_verified": bool(profile.get("is_verified", False)),
        "bio": profile.get("biography") or profile.get("bio") or "",
    }


@api_router.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user["_id"]), email)
    response.set_cookie(key="access_token", value=token, httponly=True, secure=True,
                        samesite="none", max_age=12 * 3600, path="/")
    return {"id": str(user["_id"]), "email": email, "role": user.get("role", "user"), "access_token": token}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.get("/categories")
async def list_categories(user: dict = Depends(get_current_user)):
    cursor = db.categories.find({"user_id": user["id"]}).sort("created_at", 1)
    return [{"id": c["id"], "name": c["name"]} async for c in cursor]


@api_router.post("/categories")
async def create_category(payload: CategoryIn, user: dict = Depends(get_current_user)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    existing = await db.categories.find_one({"user_id": user["id"], "name": name})
    if existing:
        return {"id": existing["id"], "name": existing["name"]}
    cat = Category(name=name, user_id=user["id"])
    await db.categories.insert_one(cat.model_dump())
    return {"id": cat.id, "name": cat.name}


@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, user: dict = Depends(get_current_user)):
    await db.categories.delete_one({"id": cat_id, "user_id": user["id"]})
    await db.profiles.update_many({"user_id": user["id"], "category_ids": cat_id},
                                  {"$pull": {"category_ids": cat_id}})
    return {"ok": True}


@api_router.get("/profiles")
async def list_profiles(user: dict = Depends(get_current_user)):
    cursor = db.profiles.find({"user_id": user["id"]}).sort("created_at", -1)
    out = []
    async for p in cursor:
        out.append({
            "id": p["id"], "username": p["username"],
            "full_name": p.get("full_name", ""), "profile_pic_url": p.get("profile_pic_url", ""),
            "is_verified": p.get("is_verified", False), "bio": p.get("bio", ""),
            "category_ids": p.get("category_ids", []),
        })
    return out


@api_router.post("/profiles")
async def add_profile(payload: ProfileIn, user: dict = Depends(get_current_user)):
    username = extract_username(payload.url_or_username)
    if not username:
        raise HTTPException(status_code=400, detail="Could not extract a valid Instagram username")

    existing = await db.profiles.find_one({"user_id": user["id"],
        "username": {"$regex": f"^{re.escape(username)}$", "$options": "i"}})
    if existing:
        new_cats = list({*existing.get("category_ids", []), *payload.category_ids})
        await db.profiles.update_one({"_id": existing["_id"]}, {"$set": {"category_ids": new_cats}})
        return {"id": existing["id"], "username": existing["username"],
                "full_name": existing.get("full_name", ""), "profile_pic_url": existing.get("profile_pic_url", ""),
                "is_verified": existing.get("is_verified", False), "bio": existing.get("bio", ""),
                "category_ids": new_cats, "duplicate": True}

    fetched = await fetch_instagram_profile(username)
    profile = Profile(
        username=fetched.get("username") or username,
        full_name=fetched.get("full_name", ""), profile_pic_url=fetched.get("profile_pic_url", ""),
        is_verified=fetched.get("is_verified", False), bio=fetched.get("bio", ""),
        category_ids=payload.category_ids, user_id=user["id"])
    await db.profiles.insert_one(profile.model_dump())
    return {"id": profile.id, "username": profile.username, "full_name": profile.full_name,
            "profile_pic_url": profile.profile_pic_url, "is_verified": profile.is_verified,
            "bio": profile.bio, "category_ids": profile.category_ids}


@api_router.patch("/profiles/{pid}")
async def update_profile(pid: str, payload: ProfileUpdate, user: dict = Depends(get_current_user)):
    update = {}
    if payload.category_ids is not None:
        update["category_ids"] = payload.category_ids
    if not update:
        return {"ok": True}
    res = await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"ok": True}


@api_router.post("/profiles/{pid}/refresh")
async def refresh_profile(pid: str, user: dict = Depends(get_current_user)):
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    fetched = await fetch_instagram_profile(p["username"])
    if not fetched.get("username"):
        raise HTTPException(status_code=502, detail="Could not refresh from RapidAPI")
    new_data = {
        "full_name": fetched.get("full_name", p.get("full_name", "")),
        "profile_pic_url": fetched.get("profile_pic_url", p.get("profile_pic_url", "")),
        "is_verified": fetched.get("is_verified", p.get("is_verified", False)),
        "bio": fetched.get("bio", p.get("bio", "")),
    }
    await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": new_data})
    return {**new_data, "id": p["id"], "username": p["username"], "category_ids": p.get("category_ids", [])}


@api_router.delete("/profiles/{pid}")
async def delete_profile(pid: str, user: dict = Depends(get_current_user)):
    await db.profiles.delete_one({"id": pid, "user_id": user["id"]})
    return {"ok": True}


async def _ensure_categories(user_id: str, names: List[str]) -> dict:
    names = [n.strip() for n in names if n and n.strip()]
    if not names:
        return {}
    existing = {}
    async for c in db.categories.find({"user_id": user_id, "name": {"$in": names}}):
        existing[c["name"]] = c["id"]
    for name in names:
        if name not in existing:
            cat = Category(name=name, user_id=user_id)
            await db.categories.insert_one(cat.model_dump())
            existing[name] = cat.id
    return existing


@api_router.post("/profiles/bulk")
async def bulk_add_profiles(payload: BulkIn, user: dict = Depends(get_current_user)):
    results = []
    all_names = list({n for item in payload.items for n in item.category_names})
    name_to_id = await _ensure_categories(user["id"], all_names)

    for item in payload.items:
        username = extract_username(item.url_or_username)
        if not username:
            results.append({"input": item.url_or_username, "status": "error", "error": "Invalid username"})
            continue
        cat_ids = [name_to_id[n] for n in item.category_names if n in name_to_id]
        existing = await db.profiles.find_one({"user_id": user["id"],
            "username": {"$regex": f"^{re.escape(username)}$", "$options": "i"}})
        if existing:
            new_cats = list({*existing.get("category_ids", []), *cat_ids})
            await db.profiles.update_one({"_id": existing["_id"]}, {"$set": {"category_ids": new_cats}})
            results.append({"input": item.url_or_username, "status": "merged",
                            "username": existing["username"], "id": existing["id"]})
            continue
        fetched = await fetch_instagram_profile(username)
        profile = Profile(
            username=fetched.get("username") or username,
            full_name=fetched.get("full_name", ""), profile_pic_url=fetched.get("profile_pic_url", ""),
            is_verified=fetched.get("is_verified", False), bio=fetched.get("bio", ""),
            category_ids=cat_ids, user_id=user["id"])
        await db.profiles.insert_one(profile.model_dump())
        results.append({"input": item.url_or_username, "status": "added",
                        "username": profile.username, "id": profile.id,
                        "has_avatar": bool(profile.profile_pic_url)})
    return {"results": results, "count": len(results)}


@api_router.get("/img-proxy")
async def img_proxy(url: str):
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid url")
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Referer": "https://www.instagram.com/",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as cx:
            r = await cx.get(url, headers=headers)
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail="Upstream image error")
            return Response(content=r.content,
                            media_type=r.headers.get("content-type", "image/jpeg"),
                            headers={"Cache-Control": "public, max-age=86400"})
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Upstream image error")


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.categories.create_index([("user_id", 1), ("name", 1)])
    await db.profiles.create_index([("user_id", 1), ("username", 1)])
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email and admin_password:
        existing = await db.users.find_one({"email": admin_email})
        if not existing:
            await db.users.insert_one({
                "email": admin_email, "password_hash": hash_password(admin_password),
                "role": "admin", "created_at": datetime.now(timezone.utc).isoformat(),
            })
        elif not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one({"email": admin_email},
                                       {"$set": {"password_hash": hash_password(admin_password)}})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
