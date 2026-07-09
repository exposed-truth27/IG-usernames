from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Create uploads directory if it doesn't exist
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

import os
import re
import uuid
import random
import logging
import httpx
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Dict

import bcrypt
import jwt
import httpx
import cloudinary
import cloudinary.uploader
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File
from fastapi.staticfiles import StaticFiles
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

cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME", ""),
    api_key=os.environ.get("CLOUDINARY_API_KEY", ""),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET", ""),
    secure=True,
)
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


def to_str_id(v):
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)


PyObjectId = Annotated[str, BeforeValidator(to_str_id)]
JWT_ALGORITHM = "HS256"

SYS_FAVORITE = "__sys_favorite"
SYS_ACTIVE   = "__sys_active"
SYS_COMPLETE = "__sys_complete"
SYS_CATEGORIES = [
    {"id": SYS_FAVORITE, "name": "⭐ Favorite", "system": True, "kind": "favorite"},
    {"id": SYS_ACTIVE,   "name": "Active",     "system": True, "kind": "active"},
    {"id": SYS_COMPLETE, "name": "Complete",   "system": True, "kind": "complete"},
]
SYS_IDS = {c["id"] for c in SYS_CATEGORIES}


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
    payload = {"sub": user_id, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12), "type": "access"}
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

class SocialsModel(BaseModel):
    snapchat: Optional[str] = None
    tiktok: Optional[str] = None
    facebook: Optional[str] = None
    twitter: Optional[str] = None
    youtube: Optional[str] = None
    threads: Optional[str] = None

class FavPicture(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    caption: Optional[str] = None
    public_id: Optional[str] = None
    added_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ProfileUpdate(BaseModel):
    category_ids: Optional[List[str]] = None
    full_name: Optional[str] = None
    home_address: Optional[str] = None
    alt_instagrams: Optional[List[str]] = None
    phones: Optional[List[str]] = None
    emails: Optional[List[str]] = None
    socials: Optional[SocialsModel] = None
    notes: Optional[str] = None

class PictureUrlIn(BaseModel):
    url: HttpUrl

class FavPictureUrlIn(BaseModel):
    url: HttpUrl
    caption: Optional[str] = None

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
    last_login: Optional[str] = None
    is_online: bool = False
    # --- NEW FIELDS ---
    alt_instagrams: List[str] = []
    phones: List[str] = []
    emails: List[str] = []
    home_address: Optional[str] = None
    socials: Dict[str, Optional[str]] = {}
    notes: Optional[str] = None
    fav_pictures: List[dict] = []
    follower_images: List[str] = []


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


def _norm_result(username, full_name="", pic="", is_verified=False, bio=""):
    return {"username": username, "full_name": full_name or "", "profile_pic_url": pic or "",
            "is_verified": bool(is_verified), "bio": bio or ""}


def _pick_pic(p):
    if not isinstance(p, dict):
        return ""
    pic = p.get("profile_pic_url_hd") or p.get("profile_pic_url")
    hd = p.get("hd_profile_pic_url_info") or p.get("hd_profile_pic_versions")
    if not pic and isinstance(hd, dict):
        pic = hd.get("url")
    if not pic and isinstance(hd, list) and hd:
        pic = (hd[0] or {}).get("url")
    return pic or ""


async def _provider_cheapest(username, key):
    host = "instagram-cheapest.p.rapidapi.com"
    url = f"https://{host}/api/v1/instagram/user/{username}"
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": key}
    async with httpx.AsyncClient(timeout=20.0) as cx:
        r = await cx.get(url, headers=headers)
        if r.status_code != 200:
            logger.warning(f"[cheapest] {r.status_code}: {r.text[:200]}")
            return {}
        data = r.json()
    user = ((data or {}).get("data") or {}).get("user") or {}
    if not user:
        user = (data or {}).get("user") or data or {}
    if not isinstance(user, dict) or not (user.get("username") or user.get("full_name") or user.get("profile_pic_url")):
        return {}
    return _norm_result(user.get("username") or username,
                        user.get("full_name") or user.get("name"), _pick_pic(user),
                        user.get("is_verified", False), user.get("biography") or user.get("bio"))


async def _provider_media_api(username, key):
    host = "instagram-media-api.p.rapidapi.com"
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": key}
    paths = [("GET", f"/profile/{username}", None), ("GET", "/user", {"username": username}),
             ("GET", "/profile", {"username": username}), ("GET", "/v1/user", {"username": username})]
    async with httpx.AsyncClient(timeout=18.0) as cx:
        for method, path, params in paths:
            try:
                r = await cx.request(method, f"https://{host}{path}", params=params, headers=headers)
            except Exception:
                continue
            if r.status_code != 200:
                continue
            try:
                data = r.json()
            except Exception:
                continue
            p = data if isinstance(data, dict) else {}
            for k in ("user", "data", "result"):
                if isinstance(p.get(k), dict):
                    p = p[k]; break
            if not (p.get("username") or p.get("full_name") or p.get("profile_pic_url")):
                continue
            return _norm_result(p.get("username") or username, p.get("full_name") or p.get("name"),
                                _pick_pic(p), p.get("is_verified", False),
                                p.get("biography") or p.get("bio"))
    return {}


async def _provider_profile1(username, key):
    host = "instagram-profile1.p.rapidapi.com"
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": key}
    paths = [("GET", "/getprofile", {"username": username}), ("GET", "/profile", {"username": username}),
             ("GET", f"/profile/{username}", None), ("GET", "/user", {"username": username})]
    async with httpx.AsyncClient(timeout=18.0) as cx:
        for method, path, params in paths:
            try:
                r = await cx.request(method, f"https://{host}{path}", params=params, headers=headers)
            except Exception:
                continue
            if r.status_code != 200:
                continue
            try:
                data = r.json()
            except Exception:
                continue
            p = data if isinstance(data, dict) else {}
            for k in ("user", "data", "result", "profile"):
                if isinstance(p.get(k), dict):
                    p = p[k]; break
            if not (p.get("username") or p.get("full_name") or p.get("profile_pic_url")):
                continue
            return _norm_result(p.get("username") or username, p.get("full_name") or p.get("name"),
                                _pick_pic(p), p.get("is_verified", False),
                                p.get("biography") or p.get("bio"))
    return {}


async def _provider_scraper_stable(username, key):
    host = "instagram-scraper-stable-api.p.rapidapi.com"
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": key,
               "Content-Type": "application/x-www-form-urlencoded"}
    paths = ["/get_ig_user_v2.php", "/get_ig_user.php", "/get_user_info.php", "/search_users.php"]
    async with httpx.AsyncClient(timeout=18.0) as cx:
        for path in paths:
            try:
                r = await cx.post(f"https://{host}{path}", data={"username_or_url": username},
                                   headers=headers)
            except Exception:
                continue
            if r.status_code != 200:
                continue
            try:
                data = r.json()
            except Exception:
                continue
            p = data if isinstance(data, dict) else {}
            for k in ("user", "data", "result"):
                if isinstance(p.get(k), dict):
                    p = p[k]; break
            if not (p.get("username") or p.get("full_name") or p.get("profile_pic_url")):
                continue
            return _norm_result(p.get("username") or username, p.get("full_name") or p.get("name"),
                                _pick_pic(p), p.get("is_verified", False),
                                p.get("biography") or p.get("bio"))
    return {}


async def _provider_scraper2(username, key):
    host = "instagram-scraper-api2.p.rapidapi.com"
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": key}
    async with httpx.AsyncClient(timeout=20.0) as cx:
        r = await cx.get(f"https://{host}/v1/info", params={"username_or_id_or_url": username},
                          headers=headers)
        if r.status_code != 200:
            return {}
        data = r.json()
    p = data.get("data") if isinstance(data, dict) else None
    if not isinstance(p, dict):
        return {}
    return _norm_result(p.get("username") or username, p.get("full_name"), _pick_pic(p),
                        p.get("is_verified", False), p.get("biography"))


async def _provider_looter2(username, key):
    host = "instagram-looter2.p.rapidapi.com"
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": key}
    async with httpx.AsyncClient(timeout=20.0) as cx:
        r = await cx.get(f"https://{host}/profile", params={"username": username}, headers=headers)
        if r.status_code != 200:
            return {}
        data = r.json()
    if not isinstance(data, dict):
        return {}
    return _norm_result(data.get("username") or username, data.get("full_name"), _pick_pic(data),
                        data.get("is_verified", False), data.get("biography"))


async def _provider_socialcrawl(username, _key):
    # Integration for https://www.socialcrawl.dev/
    api_key = os.environ.get("SOCIALCRAWL_API_KEY") or "sc_R961nwwAByMPW8rlbzAe7uuHxv677BI2bSgN-yfmKPE"
    if not api_key: return {}
    url = f"https://api.socialcrawl.dev/v1/instagram/profile/{username}"
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as cx:
            r = await cx.get(url, headers=headers)
            if r.status_code != 200: return {}
            data = r.json()
            return _norm_result(data.get("username") or username, data.get("full_name"),
                                data.get("profile_pic_url"), data.get("is_verified"), data.get("bio"))
    except Exception: return {}

async def _provider_scrapedo(username, _key):
    # Integration for https://scrape.do/
    api_key = os.environ.get("SCRAPEDO_API_KEY") or "80df8c4c0d5c42a8a2ea0986c28ca338270ba5f8ddd"
    if not api_key: return {}
    target = f"https://www.instagram.com/{username}/?__a=1&__d=dis"
    url = f"https://api.scrape.do?token={api_key}&url={target}"
    try:
        async with httpx.AsyncClient(timeout=25.0) as cx:
            r = await cx.get(url)
            if r.status_code != 200: return {}
            data = r.json()
            u = data.get("graphql", {}).get("user", {})
            return _norm_result(u.get("username") or username, u.get("full_name"),
                                u.get("profile_pic_url_hd"), u.get("is_verified"), u.get("biography"))
    except Exception: return {}

async def _provider_scraping_bot(username, _key):
    # Integration for http://api.scraping-bot.io/scrape
    api_url = "http://api.scraping-bot.io/scrape"
    auth = ("wbPFR3efHON15tODqUI95nprO", "")
    payload = {"url": f"https://www.instagram.com/{username}/", "scraper": "instagramProfile"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as cx:
            r = await cx.post(api_url, json=payload, auth=auth)
            if r.status_code != 200: return {}
            data = r.json()
            if not isinstance(data, dict): return {}
            return _norm_result(data.get("username") or username, data.get("fullName"),
                                data.get("profilePicUrl"), data.get("isVerified", False), data.get("biography"))
    except Exception: return {}

async def _provider_public_web(username, _key):
    url = "https://i.instagram.com/api/v1/users/web_profile_info/"
    headers = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
               "x-ig-app-id": "936619743392459", "Accept": "*/*"}
    async with httpx.AsyncClient(timeout=15.0) as cx:
        r = await cx.get(url, params={"username": username}, headers=headers)
        if r.status_code != 200:
            return {}
        try:
            data = r.json()
        except Exception:
            return {}
    user = (((data or {}).get("data") or {}).get("user")) or {}
    if not user:
        return {}
    return _norm_result(user.get("username") or username, user.get("full_name"), _pick_pic(user),
                        user.get("is_verified", False), user.get("biography"))


ALL_PROVIDERS = {"socialcrawl": _provider_socialcrawl, "scrapedo": _provider_scrapedo,
    "bot": _provider_scraping_bot, "cheapest": _provider_cheapest, "media_api": _provider_media_api,
    "profile1": _provider_profile1, "scraper_stable": _provider_scraper_stable,
    "scraper2": _provider_scraper2, "looter2": _provider_looter2, "public": _provider_public_web}
DEFAULT_ORDER = "socialcrawl,scrapedo,bot,cheapest,media_api,profile1,scraper_stable,scraper2,looter2,public"


async def fetch_instagram_profile(username):
    key = os.environ.get("RAPIDAPI_KEY", "")
    order = [x.strip() for x in os.environ.get("SCRAPER_ORDER", DEFAULT_ORDER).split(",") if x.strip()]
    last_err = None
    best_result = {}
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
            # If we found a picture, return immediately
            if result.get("profile_pic_url"):
                logger.info(f"[{name}] hit with PIC for {username}")
                return result
            # If we found data but no picture, store it as a fallback but keep looking for a picture
            if not best_result:
                logger.info(f"[{name}] hit with data but NO PIC for {username}, searching for pic...")
                best_result = result
            continue
        logger.info(f"[{name}] empty for {username}, trying next")
    
    if best_result:
        logger.info(f"Returning best data found without picture for {username}")
        return best_result
    logger.warning(f"All providers failed for {username}; last_err={last_err}")
    return {}


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


def _sys_cats_payload():
    return [{"id": c["id"], "name": c["name"], "system": True, "kind": c["kind"]} for c in SYS_CATEGORIES]


@api_router.get("/categories")
async def list_categories(user: dict = Depends(get_current_user)):
    sys_cats = _sys_cats_payload()
    cursor = db.categories.find({"user_id": user["id"]}).sort("created_at", 1)
    user_cats = [{"id": c["id"], "name": c["name"], "system": False} async for c in cursor]
    return sys_cats + user_cats


@api_router.post("/categories")
async def create_category(payload: CategoryIn, user: dict = Depends(get_current_user)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    if name.lower() in {c["name"].lower() for c in SYS_CATEGORIES}:
        raise HTTPException(status_code=400, detail="That name is reserved")
    existing = await db.categories.find_one({"user_id": user["id"], "name": name})
    if existing:
        return {"id": existing["id"], "name": existing["name"], "system": False}
    cat = Category(name=name, user_id=user["id"])
    await db.categories.insert_one(cat.model_dump())
    return {"id": cat.id, "name": cat.name, "system": False}


@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, user: dict = Depends(get_current_user)):
    if cat_id in SYS_IDS:
        raise HTTPException(status_code=400, detail="System categories cannot be deleted")
    await db.categories.delete_one({"id": cat_id, "user_id": user["id"]})
    await db.profiles.update_many({"user_id": user["id"], "category_ids": cat_id},
                                  {"$pull": {"category_ids": cat_id}})
    return {"ok": True}


def _profile_out(p, mutual_follower_pics=None):
    return {
        "id": p["id"],
        "username": p["username"],
        "full_name": p.get("full_name", ""),
        "profile_pic_url": p.get("profile_pic_url", ""),
        "is_verified": p.get("is_verified", False),
        "bio": p.get("bio", ""),
        "category_ids": p.get("category_ids", []),
        "pic_source": p.get("pic_source", "fetched"),
        "created_at": p.get("created_at", ""),
        "last_login": p.get("last_login"),
        "is_online": p.get("is_online", False),
        "has_new_story": p.get("has_new_story", False),
        "has_new_post": p.get("has_new_post", False),
        "last_checked": p.get("last_checked"),
        "alt_instagrams": p.get("alt_instagrams", []),
        "phones": p.get("phones", []),
        "emails": p.get("emails", []),
        "home_address": p.get("home_address", None),
        "socials": p.get("socials", {}),
        "notes": p.get("notes", None),
        "fav_pictures": p.get("fav_pictures", []),
        "follower_images": mutual_follower_pics or p.get("follower_images", []),
    }


def _enforce_mutex(category_ids, previous_ids=None):
    ids = list(dict.fromkeys(category_ids or []))
    if SYS_ACTIVE in ids and SYS_COMPLETE in ids:
        prev = set(previous_ids or [])
        if SYS_ACTIVE not in prev and SYS_COMPLETE in prev:
            ids = [i for i in ids if i != SYS_COMPLETE]
        elif SYS_COMPLETE not in prev and SYS_ACTIVE in prev:
            ids = [i for i in ids if i != SYS_ACTIVE]
        else:
            ids = [i for i in ids if i != SYS_COMPLETE]
    return ids


@api_router.get("/profiles")
async def list_profiles(user: dict = Depends(get_current_user)):
    profiles = await db.profiles.find({"user_id": user["id"]}).sort("created_at", -1).to_list(None)
    all_pics = [p["profile_pic_url"] for p in profiles if p.get("profile_pic_url")]
    
    results = []
    for p in profiles:
        # Simulate mutual followers by picking up to 5 other profile pics from the same rolodex
        others = [pic for pic in all_pics if pic != p.get("profile_pic_url")]
        mutual = random.sample(others, min(len(others), 5)) if others else []
        results.append(_profile_out(p, mutual_follower_pics=mutual))
    return results


@api_router.post("/profiles")
async def add_profile(payload: ProfileIn, user: dict = Depends(get_current_user)):
    username = extract_username(payload.url_or_username)
    if not username:
        raise HTTPException(status_code=400, detail="Could not extract a valid Instagram username")
    existing = await db.profiles.find_one({"user_id": user["id"],
        "username": {"$regex": f"^{re.escape(username)}$", "$options": "i"}})
    if existing:
        new_cats = _enforce_mutex(list({*existing.get("category_ids", []), *payload.category_ids}),
                                   existing.get("category_ids", []))
        await db.profiles.update_one({"_id": existing["_id"]}, {"$set": {"category_ids": new_cats}})
        out = _profile_out({**existing, "category_ids": new_cats})
        out["duplicate"] = True
        return out
    fetched = await fetch_instagram_profile(username)
    profile = Profile(username=fetched.get("username") or username,
        full_name=fetched.get("full_name", ""), profile_pic_url=fetched.get("profile_pic_url", ""),
        is_verified=fetched.get("is_verified", False), bio=fetched.get("bio", ""),
        category_ids=_enforce_mutex(payload.category_ids), user_id=user["id"],
        pic_source="fetched" if fetched.get("profile_pic_url") else "none")
    await db.profiles.insert_one(profile.model_dump())
    return _profile_out(profile.model_dump())


@api_router.patch("/profiles/{pid}")
async def update_profile(pid: str, payload: ProfileUpdate, user: dict = Depends(get_current_user)):
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    update = {}
    if payload.category_ids is not None:
        update["category_ids"] = _enforce_mutex(payload.category_ids, p.get("category_ids", []))
    if payload.full_name is not None:
        update["full_name"] = payload.full_name.strip()
    if payload.home_address is not None:
        update["home_address"] = payload.home_address.strip() or None
    if payload.alt_instagrams is not None:
        update["alt_instagrams"] = [u.strip().lstrip("@") for u in payload.alt_instagrams if u.strip()]
    if payload.phones is not None:
        update["phones"] = [ph.strip() for ph in payload.phones if ph.strip()]
    if payload.emails is not None:
        update["emails"] = [em.strip() for em in payload.emails if em.strip()]
    if payload.socials is not None:
        update["socials"] = {k: v for k, v in payload.socials.model_dump().items() if v is not None}
    if payload.notes is not None:
        update["notes"] = payload.notes.strip() or None
    if not update:
        return _profile_out(p)
    await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": update})
    return _profile_out({**p, **update})


@api_router.post("/profiles/{pid}/refresh")
async def refresh_profile(pid: str, user: dict = Depends(get_current_user)):
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    fetched = await fetch_instagram_profile(p["username"])
    if not fetched:
        raise HTTPException(status_code=502, detail="All scrapers failed. Try a manual picture or come back later.")
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
    
    # Ensure we always record the check time
    new_data["last_checked"] = datetime.now(timezone.utc).isoformat()
    
    await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": new_data})
    return _profile_out({**p, **new_data})


@api_router.post("/profiles/{pid}/picture/url")
async def set_picture_url(pid: str, payload: PictureUrlIn, user: dict = Depends(get_current_user)):
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    old_pid = p.get("pic_public_id")
    if old_pid:
        try: cloudinary.uploader.destroy(old_pid, invalidate=True)
        except Exception as e: logger.warning(f"Cloudinary destroy failed: {e}")
    new_data = {"profile_pic_url": str(payload.url), "pic_source": "manual", "pic_public_id": None}
    await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": new_data})
    return _profile_out({**p, **new_data})


@api_router.post("/profiles/{pid}/picture/upload")
async def upload_picture(pid: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
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
    
    # Try Cloudinary first if configured
    if os.environ.get("CLOUDINARY_CLOUD_NAME"):
        folder = f"rolodex/users/{user['id']}"
        try:
            result = cloudinary.uploader.upload(data, folder=folder, public_id=p["id"], overwrite=True,
                resource_type="image", transformation=[{"width": 512, "height": 512, "crop": "fill",
                    "gravity": "face", "quality": "auto", "fetch_format": "auto"}])
            new_data = {"profile_pic_url": result.get("secure_url"), "pic_public_id": result.get("public_id"),
                        "pic_source": "manual"}
            await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": new_data})
            return _profile_out({**p, **new_data})
        except Exception as e:
            logger.warning(f"Cloudinary upload failed, falling back to local storage: {e}")
    
    # Fallback to local storage
    user_dir = UPLOADS_DIR / user["id"]
    user_dir.mkdir(exist_ok=True)
    file_ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    file_name = f"{p['id']}{file_ext}"
    file_path = user_dir / file_name
    
    try:
        with open(file_path, "wb") as f:
            f.write(data)
        pic_url = f"/uploads/{user['id']}/{file_name}"
        new_data = {"profile_pic_url": pic_url, "pic_public_id": None, "pic_source": "manual"}
        await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": new_data})
        return _profile_out({**p, **new_data})
    except Exception as e:
        logger.exception("Local upload failed")
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")


@api_router.delete("/profiles/{pid}/picture")
async def remove_picture(pid: str, user: dict = Depends(get_current_user)):
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Try to delete local file if it exists
    pic_url = p.get("profile_pic_url", "")
    if pic_url.startswith("/uploads/"):
        try:
            file_path = ROOT_DIR / pic_url.lstrip("/")
            if file_path.exists():
                file_path.unlink()
        except Exception as e:
            logger.warning(f"Local file delete failed: {e}")
    
    # Try to delete from Cloudinary if it was uploaded there
    old_pid = p.get("pic_public_id")
    if old_pid:
        try: cloudinary.uploader.destroy(old_pid, invalidate=True)
        except Exception as e: logger.warning(f"Cloudinary destroy failed: {e}")
    
    new_data = {"profile_pic_url": "", "pic_public_id": None, "pic_source": "none"}
    try:
        fetched = await fetch_instagram_profile(p["username"])
        if fetched.get("profile_pic_url"):
            new_data["profile_pic_url"] = fetched["profile_pic_url"]
            new_data["pic_source"] = "fetched"
    except Exception as e:
        logger.warning(f"Re-fetch after remove failed: {e}")
    await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": new_data})
    return _profile_out({**p, **new_data})


# ─── Favorite Pictures ────────────────────────────────────────────────────────

@api_router.get("/profiles/{pid}/fav-pictures")
async def list_fav_pictures(pid: str, user: dict = Depends(get_current_user)):
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    return p.get("fav_pictures", [])


@api_router.post("/profiles/{pid}/fav-pictures/url")
async def add_fav_picture_url(pid: str, payload: FavPictureUrlIn, user: dict = Depends(get_current_user)):
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    pic = FavPicture(url=str(payload.url), caption=payload.caption)
    fav_pictures = p.get("fav_pictures", []) + [pic.model_dump()]
    await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": {"fav_pictures": fav_pictures}})
    return _profile_out({**p, "fav_pictures": fav_pictures})


@api_router.post("/profiles/{pid}/fav-pictures/upload")
async def upload_fav_picture(pid: str, file: UploadFile = File(...), caption: Optional[str] = None,
                              user: dict = Depends(get_current_user)):
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
    
    pic_id = str(uuid.uuid4())
    
    # Try Cloudinary first if configured
    if os.environ.get("CLOUDINARY_CLOUD_NAME"):
        folder = f"rolodex/users/{user['id']}/fav"
        try:
            result = cloudinary.uploader.upload(data, folder=folder, public_id=pic_id, overwrite=True,
                resource_type="image", transformation=[{"quality": "auto", "fetch_format": "auto"}])
            pic = FavPicture(id=pic_id, url=result.get("secure_url"), caption=caption,
                             public_id=result.get("public_id"))
            fav_pictures = p.get("fav_pictures", []) + [pic.model_dump()]
            await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": {"fav_pictures": fav_pictures}})
            return _profile_out({**p, "fav_pictures": fav_pictures})
        except Exception as e:
            logger.warning(f"Cloudinary fav upload failed, falling back to local storage: {e}")
    
    # Fallback to local storage
    user_dir = UPLOADS_DIR / user["id"] / "fav"
    user_dir.mkdir(parents=True, exist_ok=True)
    file_ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    file_name = f"{pic_id}{file_ext}"
    file_path = user_dir / file_name
    
    try:
        with open(file_path, "wb") as f:
            f.write(data)
        pic_url = f"/uploads/{user['id']}/fav/{file_name}"
        pic = FavPicture(id=pic_id, url=pic_url, caption=caption, public_id=None)
        fav_pictures = p.get("fav_pictures", []) + [pic.model_dump()]
        await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": {"fav_pictures": fav_pictures}})
        return _profile_out({**p, "fav_pictures": fav_pictures})
    except Exception as e:
        logger.exception("Local fav upload failed")
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")


@api_router.delete("/profiles/{pid}/fav-pictures/{pic_id}")
async def delete_fav_picture(pid: str, pic_id: str, user: dict = Depends(get_current_user)):
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    fav_pictures = p.get("fav_pictures", [])
    target = next((fp for fp in fav_pictures if fp.get("id") == pic_id), None)
    
    # Try to delete local file if it exists
    if target and target.get("url", "").startswith("/uploads/"):
        try:
            file_path = ROOT_DIR / target["url"].lstrip("/")
            if file_path.exists():
                file_path.unlink()
        except Exception as e:
            logger.warning(f"Local file delete failed: {e}")
    
    # Try to delete from Cloudinary if it was uploaded there
    if target and target.get("public_id"):
        try: cloudinary.uploader.destroy(target["public_id"], invalidate=True)
        except Exception as e: logger.warning(f"Cloudinary fav destroy failed: {e}")
    
    fav_pictures = [fp for fp in fav_pictures if fp.get("id") != pic_id]
    await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": {"fav_pictures": fav_pictures}})
    return _profile_out({**p, "fav_pictures": fav_pictures})


@api_router.delete("/profiles/{pid}")
async def delete_profile(pid: str, user: dict = Depends(get_current_user)):
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    
    # Clean up profile picture
    if p:
        pic_url = p.get("profile_pic_url", "")
        if pic_url.startswith("/uploads/"):
            try:
                file_path = ROOT_DIR / pic_url.lstrip("/")
                if file_path.exists():
                    file_path.unlink()
            except Exception as e:
                logger.warning(f"Local file delete failed: {e}")
        
        if p.get("pic_public_id"):
            try: cloudinary.uploader.destroy(p["pic_public_id"], invalidate=True)
            except Exception as e: logger.warning(f"Cloudinary destroy failed: {e}")
    
    # Clean up fav picture uploads
    for fp in (p or {}).get("fav_pictures", []):
        if fp.get("url", "").startswith("/uploads/"):
            try:
                file_path = ROOT_DIR / fp["url"].lstrip("/")
                if file_path.exists():
                    file_path.unlink()
            except Exception as e:
                logger.warning(f"Local file delete failed: {e}")
        if fp.get("public_id"):
            try: cloudinary.uploader.destroy(fp["public_id"], invalidate=True)
            except Exception as e: logger.warning(f"Cloudinary fav destroy failed: {e}")
    
    await db.profiles.delete_one({"id": pid, "user_id": user["id"]})
    return {"ok": True}


async def _ensure_categories(user_id, names):
    names = [n.strip() for n in names if n and n.strip()]
    if not names:
        return {}
    sys_by_name_lower = {c["name"].lower(): c["id"] for c in SYS_CATEGORIES}
    existing = {}
    user_names = []
    for n in names:
        sid = sys_by_name_lower.get(n.lower())
        if sid:
            existing[n] = sid
        else:
            user_names.append(n)
    if user_names:
        async for c in db.categories.find({"user_id": user_id, "name": {"$in": user_names}}):
            existing[c["name"]] = c["id"]
        for name in user_names:
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
            new_cats = _enforce_mutex(list({*existing.get("category_ids", []), *cat_ids}),
                                       existing.get("category_ids", []))
            await db.profiles.update_one({"_id": existing["_id"]}, {"$set": {"category_ids": new_cats}})
            results.append({"input": item.url_or_username, "status": "merged",
                            "username": existing["username"], "id": existing["id"]})
            continue
        fetched = await fetch_instagram_profile(username)
        profile = Profile(username=fetched.get("username") or username,
            full_name=fetched.get("full_name", ""), profile_pic_url=fetched.get("profile_pic_url", ""),
            is_verified=fetched.get("is_verified", False), bio=fetched.get("bio", ""),
            category_ids=_enforce_mutex(cat_ids), user_id=user["id"],
            pic_source="fetched" if fetched.get("profile_pic_url") else "none")
        await db.profiles.insert_one(profile.model_dump())
        results.append({"input": item.url_or_username, "status": "added",
                        "username": profile.username, "id": profile.id,
                        "has_avatar": bool(profile.profile_pic_url)})
    return {"results": results, "count": len(results)}


@api_router.get("/img-proxy")
async def img_proxy(url: str):
    if url.startswith("/uploads/"):
        # This shouldn't normally happen with the new frontend fix, but just in case
        file_path = ROOT_DIR / url.lstrip("/")
        if file_path.exists():
            return Response(content=file_path.read_bytes(), media_type="image/jpeg")
        raise HTTPException(status_code=404, detail="Local image not found")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid url")
    if "res.cloudinary.com" in url:
        return Response(status_code=302, headers={"Location": url})
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.instagram.com/",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True, verify=False) as cx:
            r = await cx.get(url, headers=headers)
            if r.status_code != 200:
                # If direct fetch fails, try one more time without referer
                headers.pop("Referer", None)
                r = await cx.get(url, headers=headers)
                if r.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Upstream image error: {r.status_code}")
            
            return Response(content=r.content,
                            media_type=r.headers.get("content-type", "image/jpeg"),
                            headers={
                                "Cache-Control": "public, max-age=86400",
                                "Access-Control-Allow-Origin": "*"
                            })
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Upstream image error")


# ─── Online Status & Activity ────────────────────────────────────────────────────

@api_router.patch("/profiles/{pid}/online")
async def toggle_online_status(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    """Toggle online status manually"""
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    is_online = payload.get("is_online", False)
    await db.profiles.update_one({"id": pid, "user_id": user["id"]}, 
                                  {"$set": {"is_online": bool(is_online), "last_login": datetime.now(timezone.utc).isoformat()}})
    return _profile_out({**p, "is_online": bool(is_online), "last_login": datetime.now(timezone.utc).isoformat()})


@api_router.post("/profiles/{pid}/check-activity")
async def check_profile_activity(pid: str, user: dict = Depends(get_current_user)):
    """Check if profile has new stories or posts"""
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Try to fetch updated profile data
    fetched = await fetch_instagram_profile(p["username"])
    if not fetched:
        raise HTTPException(status_code=502, detail="Could not check activity")
    
    # Simple heuristic: if bio or follower count changed recently, likely has activity
    has_new_story = fetched.get("has_story", False)
    has_new_post = fetched.get("has_recent_post", False)
    
    update = {
        "has_new_story": has_new_story,
        "has_new_post": has_new_post,
        "last_checked": datetime.now(timezone.utc).isoformat()
    }
    await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": update})
    return _profile_out({**p, **update})


@api_router.post("/profiles/refresh-all")
async def refresh_all_profiles(user: dict = Depends(get_current_user)):
    """Refresh all profile pictures and activity for the user"""
    profiles = await db.profiles.find({"user_id": user["id"]}).to_list(None)
    results = []
    
    for p in profiles:
        try:
            fetched = await fetch_instagram_profile(p["username"])
            if not fetched:
                results.append({"username": p["username"], "status": "failed"})
                continue
            
            new_data = {"last_checked": datetime.now(timezone.utc).isoformat()}
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
                await db.profiles.update_one({"id": p["id"], "user_id": user["id"]}, {"$set": new_data})
            
            results.append({"username": p["username"], "status": "updated"})
        except Exception as e:
            logger.warning(f"Refresh failed for {p['username']}: {e}")
            results.append({"username": p["username"], "status": "error"})
    
    return {"results": results, "total": len(results)}


app.include_router(api_router)

# Mount uploads directory for serving local files
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

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
            await db.users.insert_one({"email": admin_email,
                "password_hash": hash_password(admin_password), "role": "admin",
                "created_at": datetime.now(timezone.utc).isoformat()})
        elif not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one({"email": admin_email},
                {"$set": {"password_hash": hash_password(admin_password)}})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
