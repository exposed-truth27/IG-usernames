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
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Dict

import bcrypt
import jwt
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
    mutual_follower_ids: Optional[List[str]] = None

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


# ─── Providers ──────────────────────────────────────────────────────────────

async def _provider_brightdata(username, _key):
    """Uses Bright Data Web Unlocker to fetch the profile page and extract HD data."""
    # List of Bright Data keys provided by user
    BRIGHTDATA_KEYS = [
        "a1809413-87a4-4ab0-b986-58c7a9ab2a09",
        "8c112baf-da82-4bb5-b549-3f5b615dfbef",
        "ad2b6032-5e6e-4577-9100-34c1fd45d0e0",
        "8e1c4c8c-03d5-4371-9303-921333fb26f8"
    ]
    
    # Randomize to distribute load or cycle through on failure
    random.shuffle(BRIGHTDATA_KEYS)
    
    target_url = f"https://www.instagram.com/{username}/"
    
    for bd_key in BRIGHTDATA_KEYS:
        # Bright Data Web Unlocker proxy format
        proxy_url = f"http://brd-customer-hl_5742687c-zone-web_unlocker1:{bd_key}@brd.superproxy.io:22225"
        
        try:
            proxies = {"http://": proxy_url, "https://": proxy_url}
            async with httpx.AsyncClient(proxies=proxies, timeout=30.0, follow_redirects=True, verify=False) as client:
                r = await client.get(target_url)
                if r.status_code == 200:
                    html = r.text
                    
                    # Ultra-aggressive extraction for the keys the user specified
                    pic = None
                    # Pattern 1: profile_pic_url_hd
                    match = re.search(r'"profile_pic_url_hd"\s*:\s*"([^"]+)"', html)
                    if not match: # Pattern 2: hd_profile_pic_url_info
                        match = re.search(r'"hd_profile_pic_url_info"\s*:\s*{\s*"url"\s*:\s*"([^"]+)"', html)
                    if not match: # Pattern 3: standard profile_pic_url
                        match = re.search(r'"profile_pic_url"\s*:\s*"([^"]+)"', html)
                    
                    if match:
                        pic = match.group(1).replace("\\u0026", "&").replace("\\", "")
                    
                    # Extract name
                    name = ""
                    name_match = re.search(r'"full_name"\s*:\s*"([^"]+)"', html)
                    if name_match:
                        name = name_match.group(1).replace("\\", "")
                    
                    # Extract bio
                    bio = ""
                    bio_match = re.search(r'"biography"\s*:\s*"([^"]+)"', html)
                    if bio_match:
                        bio = bio_match.group(1).replace("\\n", "\n").replace("\\", "")
                    
                    if pic or name:
                        return _norm_result(username, name, pic, False, bio)
        except Exception as e:
            logger.warning(f"Bright Data key {bd_key[:8]} failed: {e}")
            continue # Try next key
            
    return {}

async def _provider_imginn(username, _key):
    """Scrapes Imginn as a mirror source"""
    url = f"https://imginn.com/{username}/"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"}
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
            if r.status_code == 200:
                html = r.text
                pic = None
                # Imginn uses specific classes for profile pic
                match = re.search(r'<div class="img">.*?<img src="([^"]+)"', html, re.DOTALL)
                if match:
                    pic = match.group(1)
                
                name = ""
                name_match = re.search(r'<div class="info">.*?<h1>([^<]+)</h1>', html, re.DOTALL)
                if name_match:
                    name = name_match.group(1).strip()
                
                bio = ""
                bio_match = re.search(r'<div class="description">([^<]+)</div>', html, re.DOTALL)
                if bio_match:
                    bio = bio_match.group(1).strip()
                
                if pic or name:
                    return _norm_result(username, name, pic, False, bio)
    except Exception: pass
    return {}

async def _provider_save_free(username, _key):
    """Mimics save-free.com profile extraction"""
    url = "https://www.save-free.com/wp-admin/admin-ajax.php"
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://www.save-free.com/en/instagram-profile-viewer/"
        }
        data = {
            "action": "get_profile",
            "url": f"https://www.instagram.com/{username}/",
            "lang": "en"
        }
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            r = await client.post(url, headers=headers, data=data)
            if r.status_code == 200:
                html = r.text
                pic = None
                pic_patterns = [
                    r'href="([^"]+profile_pic_url[^"]+)"',
                    r'src="([^"]+profile_pic_url[^"]+)"',
                    r'href="([^"]+hd_profile_pic_url_info[^"]+)"',
                    r'https://[^"]+instagram\.com/[^"]+/_n\.(?:jpg|png|webp)'
                ]
                for pattern in pic_patterns:
                    match = re.search(pattern, html)
                    if match:
                        pic = match.group(1).replace("&amp;", "&")
                        break
                
                if pic:
                    return _norm_result(username, "", pic)
    except Exception: pass
    return {}

async def _provider_query_a(username, _key):
    """Classic ?__a=1 method with specific headers"""
    url = f"https://www.instagram.com/{username}/?__a=1&__d=dis"
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": f"https://www.instagram.com/{username}/"
    }
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
            if r.status_code == 200:
                data = r.json()
                user = data.get("graphql", {}).get("user") or data.get("user")
                if user:
                    return _norm_result(user.get("username"), user.get("full_name"), _pick_pic(user), user.get("is_verified"), user.get("biography"))
    except Exception: pass
    return {}

async def _provider_public_web(username, _key):
    # Try the i.instagram.com API first (more reliable JSON)
    try:
        api_url = f"https://i.instagram.com/api/v1/users/web_profile_info/?username={username}"
        api_headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
            "x-ig-app-id": "936619743392459",
            "Accept": "*/*",
            "Origin": "https://www.instagram.com",
            "Referer": f"https://www.instagram.com/{username}/",
        }
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(api_url, headers=api_headers)
            if r.status_code == 200:
                data = r.json()
                user = data.get("data", {}).get("user", {})
                if user:
                    return _norm_result(user.get("username") or username, user.get("full_name"), 
                                        user.get("profile_pic_url_hd") or user.get("profile_pic_url"),
                                        user.get("is_verified"), user.get("biography"))
    except Exception: pass

    # Fallback to public meta tags and deep JSON inspection
    try:
        url = f"https://www.instagram.com/{username}/"
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
            if r.status_code == 200:
                html = r.text
                pic = None
                match = re.search(r'"profile_pic_url_hd"\s*:\s*"([^"]+)"', html)
                if not match: match = re.search(r'"hd_profile_pic_url_info"\s*:\s*{\s*"url"\s*:\s*"([^"]+)"', html)
                if not match: match = re.search(r'"profile_pic_url"\s*:\s*"([^"]+)"', html)
                if not match: match = re.search(r'<meta property="og:image" content="([^"]+)"', html)
                if match: pic = match.group(1).replace("\\u0026", "&").replace("\\", "")
                
                name = ""
                name_match = re.search(r'"full_name"\s*:\s*"([^"]+)"', html)
                if not name_match: name_match = re.search(r'<meta property="og:title" content="([^"]+)"', html)
                if name_match: name = name_match.group(1).replace("\\", "").split(" (@")[0]
                
                bio = ""
                bio_match = re.search(r'"biography"\s*:\s*"([^"]+)"', html)
                if not bio_match: bio_match = re.search(r'<meta property="og:description" content="([^"]+)"', html)
                if bio_match: bio = bio_match.group(1).replace("\\n", "\n").replace("\\", "")
                
                if pic or name:
                    return _norm_result(username, name, pic, False, bio)
    except Exception: pass
    return {}

# --- Paid RapidAPI Providers ---

async def _provider_cheapest(username, key):
    host = "instagram-cheapest.p.rapidapi.com"
    url = f"https://{host}/api/v1/instagram/user/{username}"
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": key}
    try:
        async with httpx.AsyncClient(timeout=20.0) as cx:
            r = await cx.get(url, headers=headers)
            if r.status_code == 200:
                data = r.json()
                user = ((data or {}).get("data") or {}).get("user") or (data or {}).get("user") or data or {}
                return _norm_result(user.get("username") or username, user.get("full_name") or user.get("name"), _pick_pic(user), user.get("is_verified", False), user.get("biography") or user.get("bio"))
    except Exception: pass
    return {}

async def _provider_media_api(username, key):
    host = "instagram-media-api.p.rapidapi.com"
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": key}
    paths = [("/profile/", ""), ("/user", {"username": username})]
    async with httpx.AsyncClient(timeout=18.0) as cx:
        for path, params in paths:
            try:
                url = f"https://{host}{path}{username if not params else ''}"
                r = await cx.get(url, params=params, headers=headers)
                if r.status_code == 200:
                    data = r.json()
                    p = data.get("user") or data.get("data") or data.get("result") or data or {}
                    return _norm_result(p.get("username") or username, p.get("full_name") or p.get("name"), _pick_pic(p), p.get("is_verified", False), p.get("biography") or p.get("bio"))
            except Exception: continue
    return {}

async def _provider_socialcrawl(username, _key):
    api_key = os.environ.get("SOCIALCRAWL_API_KEY") or "sc_R961nwwAByMPW8rlbzAe7uuHxv677BI2bSgN-yfmKPE"
    if not api_key: return {}
    url = f"https://api.socialcrawl.dev/v1/instagram/profile/{username}"
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=20.0, verify=False) as cx:
            r = await cx.get(url, headers=headers)
            if r.status_code == 200:
                raw = r.json()
                data = raw.get("data") or raw
                return _norm_result(data.get("username") or username, data.get("full_name"), data.get("profile_pic_url") or data.get("profile_pic"), data.get("is_verified"), data.get("bio") or data.get("biography"))
    except Exception: return {}

ALL_PROVIDERS = {
    "brightdata": _provider_brightdata,
    "imginn": _provider_imginn, 
    "save_free": _provider_save_free, 
    "public": _provider_public_web, 
    "query_a": _provider_query_a, 
    "socialcrawl": _provider_socialcrawl,
    "cheapest": _provider_cheapest, 
    "media_api": _provider_media_api
}
DEFAULT_ORDER = "brightdata,imginn,save_free,public,query_a,socialcrawl,cheapest,media_api"

# ─── Core Logic ─────────────────────────────────────────────────────────────

async def fetch_instagram_profile(username, download=False, user_id=None, profile_id=None):
    key = os.environ.get("RAPIDAPI_KEY", "")
    order = [x.strip() for x in os.environ.get("SCRAPER_ORDER", DEFAULT_ORDER).split(",") if x.strip()]
    best_result = {}
    
    for name in order:
        fn = ALL_PROVIDERS.get(name)
        if not fn: continue
        try:
            result = await fn(username, key)
            if result and (result.get("profile_pic_url") or result.get("full_name") or result.get("bio")):
                pic_url = result.get("profile_pic_url")
                if pic_url and download and user_id and profile_id:
                    try:
                        local_url = await download_profile_pic(pic_url, user_id, profile_id)
                        if local_url:
                            result["profile_pic_url"] = local_url
                            result["pic_source"] = "manual"
                    except Exception as e:
                        logger.warning(f"Auto-download failed: {e}")
                
                if result.get("profile_pic_url"):
                    return result
                if not best_result:
                    best_result = result
        except Exception as e:
            logger.warning(f"[{name}] failed: {e}")
            
    return best_result or {}

async def download_profile_pic(url, user_id, profile_id):
    user_dir = UPLOADS_DIR / str(user_id)
    user_dir.mkdir(exist_ok=True)
    file_path = user_dir / f"{profile_id}_auto.jpg"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"}
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as cx:
            r = await cx.get(url, headers=headers)
            if r.status_code == 200:
                with open(file_path, "wb") as f:
                    f.write(r.content)
                return f"/uploads/{user_id}/{profile_id}_auto.jpg"
    except Exception as e:
        logger.warning(f"Download failed: {e}")
    return None

# ─── API Endpoints ──────────────────────────────────────────────────────────

@api_router.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user["_id"]), email)
    response.set_cookie(key="access_token", value=token, httponly=True, secure=True, samesite="none", max_age=12 * 3600, path="/")
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
    sys_cats = [{"id": c["id"], "name": c["name"], "system": True, "kind": c["kind"]} for c in SYS_CATEGORIES]
    cursor = db.categories.find({"user_id": user["id"]}).sort("created_at", 1)
    user_cats = [{"id": c["id"], "name": c["name"], "system": False} async for c in cursor]
    return sys_cats + user_cats

@api_router.post("/categories")
async def create_category(payload: CategoryIn, user: dict = Depends(get_current_user)):
    name = payload.name.strip()
    if not name: raise HTTPException(status_code=400, detail="Name required")
    if name.lower() in {c["name"].lower() for c in SYS_CATEGORIES}: raise HTTPException(status_code=400, detail="That name is reserved")
    existing = await db.categories.find_one({"user_id": user["id"], "name": name})
    if existing: return {"id": existing["id"], "name": existing["name"], "system": False}
    cat = Category(name=name, user_id=user["id"])
    await db.categories.insert_one(cat.model_dump())
    return {"id": cat.id, "name": cat.name, "system": False}

@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, user: dict = Depends(get_current_user)):
    if cat_id in SYS_IDS: raise HTTPException(status_code=400, detail="System categories cannot be deleted")
    await db.categories.delete_one({"id": cat_id, "user_id": user["id"]})
    await db.profiles.update_many({"user_id": user["id"], "category_ids": cat_id}, {"$pull": {"category_ids": cat_id}})
    return {"ok": True}

def _profile_out(p, mutual_follower_pics=None):
    return {
        "id": p["id"], "username": p["username"], "full_name": p.get("full_name", ""),
        "profile_pic_url": p.get("profile_pic_url", ""), "is_verified": p.get("is_verified", False),
        "bio": p.get("bio", ""), "category_ids": p.get("category_ids", []),
        "pic_source": p.get("pic_source", "fetched"), "created_at": p.get("created_at", ""),
        "last_login": p.get("last_login"), "is_online": p.get("is_online", False),
        "has_new_story": p.get("has_new_story", False), "has_new_post": p.get("has_new_post", False),
        "last_checked": p.get("last_checked"), "alt_instagrams": p.get("alt_instagrams", []),
        "phones": p.get("phones", []), "emails": p.get("emails", []),
        "home_address": p.get("home_address", None), "socials": p.get("socials", {}),
        "notes": p.get("notes", None), "fav_pictures": p.get("fav_pictures", []),
        "follower_images": mutual_follower_pics or p.get("follower_images", []),
    }

@api_router.get("/profiles")
async def list_profiles(user: dict = Depends(get_current_user)):
    profiles = await db.profiles.find({"user_id": user["id"]}).sort("created_at", -1).to_list(None)
    results = []
    for p in profiles:
        follower_ids = p.get("mutual_follower_ids", [])
        mutual = []
        if follower_ids:
            for f_id in follower_ids:
                f_prof = next((x for x in profiles if x["id"] == f_id), None)
                if f_prof and f_prof.get("profile_pic_url"):
                    mutual.append(f_prof["profile_pic_url"])
        results.append(_profile_out(p, mutual_follower_pics=mutual))
    return results

@api_router.post("/profiles")
async def add_profile(payload: ProfileIn, user: dict = Depends(get_current_user)):
    username = extract_username(payload.url_or_username)
    if not username: raise HTTPException(status_code=400, detail="Invalid username")
    existing = await db.profiles.find_one({"user_id": user["id"], "username": {"$regex": f"^{re.escape(username)}$", "$options": "i"}})
    if existing:
        await db.profiles.update_one({"_id": existing["_id"]}, {"$set": {"category_ids": list({*existing.get("category_ids", []), *payload.category_ids})}})
        return {**_profile_out(existing), "duplicate": True}
    
    fetched = await fetch_instagram_profile(username, download=True, user_id=user["id"], profile_id=str(uuid.uuid4()))
    profile = Profile(username=fetched.get("username") or username, full_name=fetched.get("full_name", ""),
        profile_pic_url=fetched.get("profile_pic_url", ""), is_verified=fetched.get("is_verified", False),
        bio=fetched.get("bio", ""), category_ids=payload.category_ids, user_id=user["id"],
        pic_source="fetched" if fetched.get("profile_pic_url") else "none")
    await db.profiles.insert_one(profile.model_dump())
    return _profile_out(profile.model_dump())

@api_router.post("/profiles/{pid}/refresh")
async def refresh_profile(pid: str, user: dict = Depends(get_current_user)):
    p = await db.profiles.find_one({"id": pid, "user_id": user["id"]})
    if not p: raise HTTPException(status_code=404, detail="Profile not found")
    fetched = await fetch_instagram_profile(p["username"], download=True, user_id=user["id"], profile_id=p["id"])
    if not fetched: raise HTTPException(status_code=502, detail="Refresh failed")
    
    new_data = {"last_checked": datetime.now(timezone.utc).isoformat()}
    if fetched.get("full_name"): new_data["full_name"] = fetched["full_name"]
    if fetched.get("bio"): new_data["bio"] = fetched["bio"]
    if fetched.get("profile_pic_url") and p.get("pic_source") != "manual":
        new_data["profile_pic_url"] = fetched["profile_pic_url"]
        new_data["pic_source"] = "fetched"
    
    await db.profiles.update_one({"id": pid, "user_id": user["id"]}, {"$set": new_data})
    return _profile_out({**p, **new_data})

@api_router.post("/img-proxy")
async def img_proxy(url: str):
    if url.startswith("/uploads/"):
        file_path = ROOT_DIR / url.lstrip("/")
        if file_path.exists(): return Response(content=file_path.read_bytes(), media_type="image/jpeg")
        raise HTTPException(status_code=404, detail="Not found")
    headers = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1", "Referer": "https://www.instagram.com/"}
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as cx:
        r = await cx.get(url, headers=headers)
        return Response(content=r.content, media_type=r.headers.get("content-type", "image/jpeg"), headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"})

# Mount uploads
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
