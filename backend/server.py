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
import cloudinary
import cloudinary.uploader
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, HttpUrl

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ---------- Cloudinary ----------
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME", ""),
    api_key=os.environ.get("CLOUDINARY_API_KEY", ""),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET", ""),
    secure=True,
)
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB


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


class PictureUrlIn(BaseModel):
    url: HttpUrl


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
    pic_source: Optional[str] = "fetched"
    pic_public_id: Optional[str] = None
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


# ============================================================
# Multi-provider Instagram fetcher  (RapidAPI primary + backups + public)
# ============================================================

def _norm_result(username: str, full_name="", pic="", is_verified=False, bio="") -> dict:
    return {
        "username": username,
        "full_name": full_name or "",
        "profile_pic_url": pic or "",
        "is_verified": bool(is_verified),
        "bio": bio or "",
    }


async def _provider_fast_reliable(username: str, key: str) -> dict:
    host = "instagram-api-fast-reliable-data-scraper.p.rapidapi.com"
    url = f"https://{host}/profile"
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": key}
    async with httpx.AsyncClient(timeout=20.0) as cx:
        r = await cx.get(url, params={"username": username}, headers=headers)
        if r.status_code != 200:
            logger.warning(f"[fast-reliable] {r.status_code}: {r.text[:160]}")
            return {}
        data = r.json()
    candidates = [data, data.get("data"), data.get("user"), (data.get("data") or {}).get("user")]
    p = next((c for c in candidates if isinstance(c, dict)
              and (c.get("username") or c.get("full_name") or c.get("profile_pic_url"))), {})
    if not p:
        return {}
    pic = p.get("profile_pic_url_hd") or p.get("profile_pic_url")
    hd = p.get("hd_profile_pic_url_info")
    if not pic and isinstance(hd, dict):
        pic = hd.get("url")
    return _norm_result(p.get("username") or username, p.get("full_name") or p.get("name"),
                        pic, p.get("is_verified", False), p.get("biography") or p.get("bio"))


async def _provider_scraper2(username: str, key: str) -> dict:
    host = "instagram-scraper-api2.p.rapidapi.com"
    url = f"https://{host}/v1/info"
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": key}
    async with httpx.AsyncClient(timeout=20.0) as cx:
        r = await cx.get(url, params={"username_or_id_or_url": username}, headers=headers)
        if r.status_code != 200:
            logger.warning(f"[scraper-api2] {r.status_code}: {r.text[:160]}")
            return {}
        data = r.json()
    p = data.get("data") if isinstance(data, dict) else None
    if not isinstance(p, dict):
        return {}
    pic = p.get("hd_profile_pic_url_info", {}).get("url") if isinstance(p.get("hd_profile_pic_url_info"), dict) else None
    pic = pic or p.get("profile_pic_url_hd") or p.get("profile_pic_url")
    return _norm_result(p.get("username") or username, p.get("full_name"),
                        pic, p.get("is_verified", False), p.get("biography"))


async def _provider_looter2(username: str, key: str) -> dict:
    host = "instagram-looter2.p.rapidapi.com"
    url = f"https://{host}/profile"
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": key}
    async with httpx.AsyncClient(timeout=20.0) as cx:
        r = await cx.get(url, params={"username": username}, headers=headers)
        if r.status_code != 200:
            logger.warning(f"[looter2] {r.status_code}: {r.text[:160]}")
            return {}
        data = r.json()
    if not isinstance(data, dict):
        return {}
    pic = data.get("profile_pic_url_hd") or data.get("profile_pic_url")
    return _norm_result(data.get("username") or username, data.get("full_name"),
                        pic, data.get("is_verified", False), data.get("biography"))


async def _provider_public_web(username: str, _key: str) -> dict:
    """Last-resort: Instagram's own web_profile_info endpoint. No key, often rate-limited."""
    url = "https://i.instagram.com/api/v1/users/web_profile_info/"
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        "x-ig-app-id": "936619743392459",
        "Accept": "*/*",
    }
    async with httpx.AsyncClient(timeout=15.0) as cx:
        r = await cx.get(url, params={"username": username}, headers=headers)
        if r.status_code != 200:
            logger.warning(f"[public-web] {r.status_code}")
            return {}
        try:
            data = r.json()
        except Exception:
            return {}
    user = (((data or {}).get("data") or {}).get("user")) or {}
    if not user:
        return {}
    pic = user.get("profile_pic_url_hd") or user.get("profile_pic_url")
    return _norm_result(user.get("username") or username, user.get("full_name"),
                        pic, user.get("is_verified", False), user.get("biography"))


# Order matters: first hit wins. User-configurable via SCRAPER_ORDER env (comma sep).
ALL_PROVIDERS = {
    "fast_reliable": _provider_fast_reliable,
    "scraper2":      _provider_scraper2,
    "looter2":       _provider_looter2,
    "public":        _provider_public_web,
}
DEFAULT_ORDER = "fast_reliable,scraper2,looter2,public"


async def fetch_instagram_profile(username: str) -> dict:
    """Try providers in order, return the first one with a non-empty result."""
    key = os.environ.get("RAPIDAPI_KEY", "")
    order = [x.strip() for x in os.environ.get("SCRAPER_ORDER", DEFAULT_ORDER).split(",") if x.strip()]
    last_err = None
    for name in order:
        fn = ALL_PROVIDERS.get(name)
        if not fn:
            continue
        try:
            result = await fn(username, key)
        except Exception as e:
            logger.exception(f"[{name}] exception: {e}")
            last_err = e
            continue
        if result and (result.get("profile_pic_url") or result.get("full_name") or result.get("bio")):
            logger.info(f"[{name}] hit for {username} (pic={bool(result.get('profile_pic_url'))})")
            return result
        logger.info(f"[{name}] empty for {username}, trying next")
    logger.warning(f"All providers failed for {username}; last_err={last_err}")
    return {}


# ============================================================
# Auth
# ============================================================

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


# ============================================================
# Categories
# ============================================================

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


# ============================================================
# Profiles
# ============================================================

def _profile_out(p: dict) -> dict:
    return {
        "id": p["id"], "username": p["username"],
        "full_name": p.get("full_name", ""), "profile_pic_url": p.get("profile_pic_url", ""),
        "is_verified": p.get("is_verified", False), "bio": p.get("bio", ""),
        "category_ids": p.get("category_ids", []),
        "pic_source": p.get("pic_source", "fetched"),
    }


@api_router.get("/profiles")
async def list_profiles(user: dict = Depends(get_current_user)):
    cursor = db.profiles.find({"user_id": user["id"]}).sort("created_at", -1)
    return [_profile_out(p) async for p in cursor]


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
        out = _profile_out({**existing, "category_ids": new_cats})
        out["duplicate"] = True
        return out

    fetched = await fetch_instagram_profile(username)
    profile = Profile(
        username=fetched.get("username") or username,
        full_name=fetched.get("full_name", ""), profile_pic_url=fetched.get("profile_pic_url", ""),
        is_verified=fetched.get("is_verified", False), bio=fetched.get("bio", ""),
        category_ids=payload.category_ids, user_id=user["id"],
        pic_source="fetched" if fetched.get("profile_pic_url") else "none")
    await db.profiles.insert_one(profile.model_dump())
    return _profile_out(profile.model_dump())


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
    if not fetched:
        raise HTTPException(status_code=502, detail="All scrapers failed. Try a manual picture or come back later.")

    # Only overwrite fields where the fetched value is non-empty. NEVER trash a manual picture.
    new_data = {}
    if fetched.get("full_name"):
        new_data["full_name"] = fetched["full_name"]
    if fetched.get("bio"):
        new_data["bio"] = fetched["bio"]
    if "is_verified" in fetched:
        new_data["is_verified"] = bool(fetched["is_verified"])

    is_manual = p.get("pic_source") == "manual"
    got_pic = bool(fetched.get("profile_pic_url"))
    if got_pic and not is_manual:
        new_data["profile_pic_url"] = fetched["profile_pic_url"]
        new_data["pic_source"] = "fetched"

    if new_data:
        await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": new_data})

    merged = {**p, **new_data}
    return _profile_out(merged)


@api_router.post("/profiles/{pid}/picture/url")
async def set_picture_url(pid: str, payload: PictureUrlIn, user: dict = Depends(get_current_user)):
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")

    old_pid = p.get("pic_public_id")
    if old_pid:
        try:
            cloudinary.uploader.destroy(old_pid, invalidate=True)
        except Exception as e:
            logger.warning(f"Cloudinary destroy failed for {old_pid}: {e}")

    new_data = {
        "profile_pic_url": str(payload.url),
        "pic_source": "manual",
        "pic_public_id": None,
    }
    await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": new_data})
    return _profile_out({**p, **new_data})


@api_router.post("/profiles/{pid}/picture/upload")
async def upload_picture(pid: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not os.environ.get("CLOUDINARY_CLOUD_NAME"):
        raise HTTPException(status_code=500, detail="Image storage is not configured (CLOUDINARY_* env vars missing).")

    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")

    ct = (file.content_type or "").lower()
    if ct not in ALLOWED_IMAGE_MIME:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {ct}")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    folder = f"rolodex/users/{user['id']}"
    try:
        result = cloudinary.uploader.upload(
            data,
            folder=folder,
            public_id=p["id"],
            overwrite=True,
            resource_type="image",
            transformation=[{"width": 512, "height": 512, "crop": "fill",
                             "gravity": "face", "quality": "auto", "fetch_format": "auto"}],
        )
    except Exception as e:
        logger.exception("Cloudinary upload failed")
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")

    new_data = {
        "profile_pic_url": result.get("secure_url"),
        "pic_public_id": result.get("public_id"),
        "pic_source": "manual",
    }
    await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": new_data})
    return _profile_out({**p, **new_data})


@api_router.delete("/profiles/{pid}")
async def delete_profile(pid: str, user: dict = Depends(get_current_user)):
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if p and p.get("pic_public_id"):
        try:
            cloudinary.uploader.destroy(p["pic_public_id"], invalidate=True)
        except Exception as e:
            logger.warning(f"Cloudinary destroy failed: {e}")
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
            category_ids=cat_ids, user_id=user["id"],
            pic_source="fetched" if fetched.get("profile_pic_url") else "none")
        await db.profiles.insert_one(profile.model_dump())
        results.append({"input": item.url_or_username, "status": "added",
                        "username": profile.username, "id": profile.id,
                        "has_avatar": bool(profile.profile_pic_url)})
    return {"results": results, "count": len(results)}


@api_router.get("/img-proxy")
async def img_proxy(url: str):
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid url")
    if "res.cloudinary.com" in url:
        return Response(status_code=302, headers={"Location": url})
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
