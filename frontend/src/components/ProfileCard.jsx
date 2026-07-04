import { useRef, useState } from "react";
import {
  BadgeCheck, ExternalLink, RefreshCw, Trash2, Tag, Image as ImageIcon,
  Upload, Link as LinkIcon, Loader2, Star, ImageOff, Edit2, X, Plus,
  Phone, Mail, Instagram, Camera, ChevronDown, ChevronUp,
} from "lucide-react";
import { proxyImg, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const SYS_FAV = "__sys_favorite";
const SYS_ACTIVE = "__sys_active";
const SYS_COMPLETE = "__sys_complete";

const SOCIAL_META = [
  { key: "snapchat",  label: "Snapchat",  placeholder: "username",        color: "#FFFC00", icon: "👻" },
  { key: "tiktok",    label: "TikTok",    placeholder: "@username",        color: "#ff0050", icon: "🎵" },
  { key: "facebook",  label: "Facebook",  placeholder: "profile or page",  color: "#1877F2", icon: "📘" },
  { key: "twitter",   label: "X / Twitter", placeholder: "@handle",        color: "#1DA1F2", icon: "🐦" },
  { key: "youtube",   label: "YouTube",   placeholder: "@channel or URL",  color: "#FF0000", icon: "▶️" },
  { key: "threads",   label: "Threads",   placeholder: "@username",        color: "#000000", icon: "🧵" },
];

function TagButton({ label, icon, onClick, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`font-mono text-[10px] uppercase tracking-wider border border-dashed border-slate-600 text-slate-400 px-2 py-0.5 rounded-sm hover:border-[#B0B7BC] hover:text-[#B0B7BC] inline-flex items-center gap-1 ${className}`}
    >
      {icon} {label}
    </button>
  );
}

function ListEditor({ label, icon: Icon, items, placeholder, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-2 inline-flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </label>
      <div className="flex gap-2 mt-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={placeholder}
          className="bg-slate-900 border-slate-600 rounded-sm h-9 text-sm focus-visible:ring-[#0076B6] font-mono"
        />
        <Button onClick={add} disabled={!draft.trim()} size="sm"
          className="rounded-sm bg-[#0076B6] hover:bg-[#0089d3] font-display uppercase tracking-widest h-9 px-3">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-700/60 border border-slate-600 text-slate-300 px-2 py-0.5 rounded-sm">
              {item}
              <button onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="text-slate-500 hover:text-red-400 ml-0.5">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProfileCard({ profile, categories, onChange, onDelete }) {
  const [imgErr, setImgErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picOpen, setPicOpen] = useState(false);
  const [picUrl, setPicUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removingPic, setRemovingPic] = useState(false);
  const fileRef = useRef(null);

  // Edit panel state
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editAltIg, setEditAltIg] = useState([]);
  const [editPhones, setEditPhones] = useState([]);
  const [editEmails, setEditEmails] = useState([]);
  const [editSocials, setEditSocials] = useState({});
  const [editNotes, setEditNotes] = useState("");

  // Fav pictures state
  const [favOpen, setFavOpen] = useState(false);
  const [favUrl, setFavUrl] = useState("");
  const [favCaption, setFavCaption] = useState("");
  const [favUploading, setFavUploading] = useState(false);
  const [deletingFavId, setDeletingFavId] = useState(null);
  const favFileRef = useRef(null);

  // Social links expand
  const [socialsExpanded, setSocialsExpanded] = useState(false);

  const initials = (profile.username || "?").slice(0, 2).toUpperCase();
  const igUrl = `https://instagram.com/${profile.username}`;
  const isManual = profile.pic_source === "manual";

  const catIds = profile.category_ids || [];
  const isFav = catIds.includes(SYS_FAV);
  const isActive = catIds.includes(SYS_ACTIVE);
  const isComplete = catIds.includes(SYS_COMPLETE);

  const altInstagrams = profile.alt_instagrams || [];
  const phones = profile.phones || [];
  const emails = profile.emails || [];
  const socials = profile.socials || {};
  const favPictures = profile.fav_pictures || [];
  const notes = profile.notes || "";

  const hasSocials = Object.values(socials).some(Boolean);
  const hasContactInfo = phones.length > 0 || emails.length > 0 || altInstagrams.length > 0 || hasSocials;

  const persistCats = async (next) => {
    try {
      const { data } = await api.patch(`/profiles/${profile.id}`, { category_ids: next });
      onChange({ ...profile, ...data });
    } catch {
      toast.error("Couldn't update categories");
    }
  };

  const toggleCategory = (catId, checked) => {
    let next = checked
      ? [...new Set([...catIds, catId])]
      : catIds.filter((c) => c !== catId);
    if (checked && catId === SYS_ACTIVE)   next = next.filter((c) => c !== SYS_COMPLETE);
    if (checked && catId === SYS_COMPLETE) next = next.filter((c) => c !== SYS_ACTIVE);
    persistCats(next);
  };

  const toggleFav = () => toggleCategory(SYS_FAV, !isFav);

  const refresh = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/profiles/${profile.id}/refresh`);
      onChange({ ...profile, ...data });
      setImgErr(false);
      toast.success(isManual ? "Refreshed (manual picture kept)" : "Refreshed from Instagram");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Refresh failed — try setting a picture manually");
    } finally { setBusy(false); }
  };

  const removeProfile = async () => {
    try { await api.delete(`/profiles/${profile.id}`); onDelete(profile.id); }
    catch { toast.error("Delete failed"); }
  };

  const removePicture = async () => {
    if (!isManual) return;
    setRemovingPic(true);
    try {
      const { data } = await api.delete(`/profiles/${profile.id}/picture`);
      onChange({ ...profile, ...data });
      setImgErr(false);
      toast.success("Manual picture removed");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't remove picture");
    } finally { setRemovingPic(false); }
  };

  const submitPicUrl = async () => {
    const v = picUrl.trim();
    if (!/^https?:\/\//i.test(v)) { toast.error("Enter a valid http(s) URL"); return; }
    setUploading(true);
    try {
      const { data } = await api.post(`/profiles/${profile.id}/picture/url`, { url: v });
      onChange({ ...profile, ...data });
      setImgErr(false);
      setPicUrl("");
      setPicOpen(false);
      toast.success("Picture updated");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't set picture URL");
    } finally { setUploading(false); }
  };

  const submitPicUpload = async (file) => {
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) { toast.error("Only JPG, PNG, WEBP, or GIF"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post(`/profiles/${profile.id}/picture/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange({ ...profile, ...data });
      setImgErr(false);
      setPicOpen(false);
      toast.success("Picture uploaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Edit panel ──────────────────────────────────────────────────────────────
  const openEdit = () => {
    setEditAltIg([...altInstagrams]);
    setEditPhones([...phones]);
    setEditEmails([...emails]);
    setEditSocials({ ...socials });
    setEditNotes(notes);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setEditSaving(true);
    try {
      const { data } = await api.patch(`/profiles/${profile.id}`, {
        alt_instagrams: editAltIg,
        phones: editPhones,
        emails: editEmails,
        socials: editSocials,
        notes: editNotes,
      });
      onChange({ ...profile, ...data });
      setEditOpen(false);
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setEditSaving(false); }
  };

  // ── Fav pictures ────────────────────────────────────────────────────────────
  const submitFavUrl = async () => {
    const v = favUrl.trim();
    if (!/^https?:\/\//i.test(v)) { toast.error("Enter a valid http(s) URL"); return; }
    setFavUploading(true);
    try {
      const { data } = await api.post(`/profiles/${profile.id}/fav-pictures/url`, {
        url: v, caption: favCaption.trim() || null,
      });
      onChange({ ...profile, ...data });
      setFavUrl("");
      setFavCaption("");
      toast.success("Favorite picture added");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't add picture");
    } finally { setFavUploading(false); }
  };

  const submitFavUpload = async (file) => {
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) { toast.error("Only JPG, PNG, WEBP, or GIF"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); return; }
    setFavUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (favCaption.trim()) form.append("caption", favCaption.trim());
      const { data } = await api.post(`/profiles/${profile.id}/fav-pictures/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange({ ...profile, ...data });
      setFavCaption("");
      toast.success("Favorite picture uploaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setFavUploading(false);
      if (favFileRef.current) favFileRef.current.value = "";
    }
  };

  const deleteFavPic = async (picId) => {
    setDeletingFavId(picId);
    try {
      const { data } = await api.delete(`/profiles/${profile.id}/fav-pictures/${picId}`);
      onChange({ ...profile, ...data });
      toast.success("Picture removed");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    } finally { setDeletingFavId(null); }
  };

  const visibleChips = catIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c) => c && !c.system);

  const statusPill = isActive
    ? { label: "ACTIVE", cls: "bg-emerald-500/15 border-emerald-400/60 text-emerald-300" }
    : isComplete
      ? { label: "COMPLETE", cls: "bg-black border-white/40 text-white" }
      : null;

  const avatarRingCls = isActive
    ? "avatar-active"
    : isComplete
      ? "avatar-complete"
      : "ring-2 ring-transparent ring-offset-2 ring-offset-slate-800 group-hover:ring-[#0076B6]/60";

  return (
    <div
      data-testid={`profile-card-${profile.username}`}
      className={`group relative bg-slate-800 border border-slate-700 rounded-sm p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[#0076B6] hover:shadow-[0_8px_32px_-8px_rgba(0,118,182,0.5)] ${isFav ? "card-fav" : ""}`}
    >
      <div className="absolute top-0 left-0 right-0 h-[3px] honolulu-stripe rounded-t-sm opacity-60 group-hover:opacity-100 transition-opacity" />

      {/* Top action bar */}
      <div className="flex items-start justify-between mb-4">
        <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-slate-500">#{(profile.id || "").slice(0, 6)}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            data-testid={`fav-${profile.username}`}
            onClick={toggleFav}
            className={`p-1.5 rounded-sm hover:bg-slate-700/60 ${isFav ? "text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
            title={isFav ? "Unfavorite" : "Mark as favorite"}
          >
            <Star className={`w-3.5 h-3.5 ${isFav ? "fill-slate-100" : ""}`} />
          </button>
          <button
            onClick={openEdit}
            className="p-1.5 text-slate-400 hover:text-[#0076B6] hover:bg-slate-700/60 rounded-sm"
            title="Edit contact info & social links"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setFavOpen(true)}
            className="p-1.5 text-slate-400 hover:text-[#0076B6] hover:bg-slate-700/60 rounded-sm"
            title="Favorite pictures"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          {isManual && (
            <button
              data-testid={`remove-pic-${profile.username}`}
              onClick={removePicture}
              disabled={removingPic}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700/60 rounded-sm disabled:opacity-50"
              title="Remove manual picture"
            >
              {removingPic ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageOff className="w-3.5 h-3.5" />}
            </button>
          )}
          <button data-testid={`set-pic-${profile.username}`} onClick={() => setPicOpen(true)} className="p-1.5 text-slate-400 hover:text-[#0076B6] hover:bg-slate-700/60 rounded-sm" title="Set profile picture manually">
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
          <button data-testid={`refresh-${profile.username}`} onClick={refresh} disabled={busy} className="p-1.5 text-slate-400 hover:text-[#0076B6] hover:bg-slate-700/60 rounded-sm" title="Refresh from Instagram">
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
          </button>
          <button data-testid={`delete-${profile.username}`} onClick={removeProfile} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700/60 rounded-sm" title="Remove">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Avatar + name */}
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div className={`w-24 h-24 rounded-full overflow-hidden border-2 border-[#B0B7BC]/40 bg-slate-900 flex items-center justify-center transition-all duration-200 ${avatarRingCls}`}>
            {profile.profile_pic_url && !imgErr ? (
              <img src={proxyImg(profile.profile_pic_url)} alt={profile.username} onError={() => setImgErr(true)} className="w-full h-full object-cover" />
            ) : (
              <span className="font-display font-black text-3xl text-[#0076B6]">{initials}</span>
            )}
          </div>
          {profile.is_verified && (
            <div className="absolute -bottom-1 -right-1 bg-[#0076B6] rounded-full p-0.5">
              <BadgeCheck className="w-4 h-4 text-white" />
            </div>
          )}
          {statusPill && (
            <div
              data-testid={`status-${profile.username}`}
              className={`absolute -top-1 -left-1 border rounded-sm px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider ${statusPill.cls}`}
            >
              {statusPill.label}
            </div>
          )}
        </div>

        <a href={igUrl} target="_blank" rel="noopener noreferrer" data-testid={`open-${profile.username}`}
          className="mt-4 font-display font-bold text-lg text-white tracking-tight hover:text-[#0076B6] inline-flex items-center gap-1.5">
          @{profile.username} <ExternalLink className="w-3.5 h-3.5 opacity-60" />
        </a>
        {profile.full_name && <div className="mt-1 text-sm text-slate-400 line-clamp-1">{profile.full_name}</div>}
        {profile.bio && <div className="mt-2 text-xs text-slate-500 line-clamp-2 leading-relaxed">{profile.bio}</div>}
      </div>

      {/* Contact info summary */}
      {hasContactInfo && (
        <div className="mt-4 space-y-1.5">
          {altInstagrams.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center">
              {altInstagrams.map((u, i) => (
                <a key={i} href={`https://instagram.com/${u}`} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[10px] text-[#7cc6e8] hover:text-[#0076B6] inline-flex items-center gap-0.5">
                  <Instagram className="w-2.5 h-2.5" /> @{u}
                </a>
              ))}
            </div>
          )}
          {phones.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-center">
              {phones.map((ph, i) => (
                <a key={i} href={`tel:${ph}`} className="font-mono text-[10px] text-slate-400 hover:text-white inline-flex items-center gap-0.5">
                  <Phone className="w-2.5 h-2.5" /> {ph}
                </a>
              ))}
            </div>
          )}
          {emails.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-center">
              {emails.map((em, i) => (
                <a key={i} href={`mailto:${em}`} className="font-mono text-[10px] text-slate-400 hover:text-white inline-flex items-center gap-0.5">
                  <Mail className="w-2.5 h-2.5" /> {em}
                </a>
              ))}
            </div>
          )}
          {hasSocials && (
            <div>
              <button
                onClick={() => setSocialsExpanded((v) => !v)}
                className="w-full flex items-center justify-center gap-1 font-mono text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 mt-1"
              >
                {socialsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {socialsExpanded ? "Hide" : "Show"} social links
              </button>
              {socialsExpanded && (
                <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
                  {SOCIAL_META.filter((s) => socials[s.key]).map((s) => (
                    <span key={s.key} className="font-mono text-[10px] bg-slate-700/50 border border-slate-600 text-slate-300 px-2 py-0.5 rounded-sm inline-flex items-center gap-1">
                      <span>{s.icon}</span> {socials[s.key]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {favPictures.length > 0 && (
            <div className="flex justify-center mt-1">
              <button onClick={() => setFavOpen(true)} className="font-mono text-[10px] text-slate-500 hover:text-[#0076B6] inline-flex items-center gap-1">
                <Camera className="w-2.5 h-2.5" /> {favPictures.length} fav photo{favPictures.length !== 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tags row */}
      <div className="mt-5 pt-4 border-t border-slate-700/70">
        <div className="flex flex-wrap items-center gap-1.5 justify-center min-h-[28px]">
          {visibleChips.map((c) => (
            <span key={c.id} className="font-mono text-[10px] uppercase tracking-wider bg-[#0076B6]/15 border border-[#0076B6]/40 text-[#7cc6e8] px-2 py-0.5 rounded-sm">{c.name}</span>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-testid={`tag-${profile.username}`} className="font-mono text-[10px] uppercase tracking-wider border border-dashed border-slate-600 text-slate-400 px-2 py-0.5 rounded-sm hover:border-[#B0B7BC] hover:text-[#B0B7BC] inline-flex items-center gap-1">
                <Tag className="w-3 h-3" /> Tag
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 rounded-sm">
              <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Status & Tags</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-700" />
              {categories.filter((c) => c.system).map((c) => {
                const checked = catIds.includes(c.id);
                return (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={checked}
                    onCheckedChange={(v) => toggleCategory(c.id, v)}
                    data-testid={`tag-opt-${c.kind}-${profile.username}`}
                    className="text-sm focus:bg-[#0076B6]/20 focus:text-white"
                  >
                    {c.name}
                  </DropdownMenuCheckboxItem>
                );
              })}
              {categories.some((c) => !c.system) && (
                <>
                  <DropdownMenuSeparator className="bg-slate-700" />
                  <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Your Categories</DropdownMenuLabel>
                </>
              )}
              {categories.filter((c) => !c.system).map((c) => {
                const checked = catIds.includes(c.id);
                return (
                  <DropdownMenuCheckboxItem key={c.id} checked={checked} onCheckedChange={(v) => toggleCategory(c.id, v)} className="text-sm focus:bg-[#0076B6]/20 focus:text-white">
                    {c.name}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Profile Picture Dialog ───────────────────────────────────────────── */}
      <Dialog open={picOpen} onOpenChange={setPicOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 rounded-sm sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-tight text-white">
              Set picture · @{profile.username}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Use this when the auto-fetch can&apos;t find a photo. Manual pictures are preserved across refreshes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-2 inline-flex items-center gap-1.5">
                <LinkIcon className="w-3 h-3" /> Paste image URL
              </label>
              <div className="flex gap-2 mt-2">
                <Input
                  data-testid={`pic-url-input-${profile.username}`}
                  value={picUrl}
                  onChange={(e) => setPicUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitPicUrl()}
                  placeholder="https://…/photo.jpg"
                  className="bg-slate-900 border-slate-600 rounded-sm h-10 focus-visible:ring-[#0076B6] font-mono text-sm"
                />
                <Button
                  data-testid={`pic-url-save-${profile.username}`}
                  onClick={submitPicUrl}
                  disabled={uploading || !picUrl.trim()}
                  className="rounded-sm bg-[#0076B6] hover:bg-[#0089d3] font-display uppercase tracking-widest"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">or</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-2 inline-flex items-center gap-1.5">
                <Upload className="w-3 h-3" /> Upload from device
              </label>
              <input
                ref={fileRef}
                data-testid={`pic-file-input-${profile.username}`}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => submitPicUpload(e.target.files?.[0])}
                disabled={uploading}
                className="block w-full text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border-0 file:font-mono file:text-[10px] file:uppercase file:tracking-widest file:bg-[#0076B6] file:text-white hover:file:bg-[#0089d3] disabled:opacity-50"
              />
            </div>
            {isManual && (
              <div className="pt-2 border-t border-slate-700">
                <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-2">Current: manual picture</p>
                <Button variant="outline" size="sm" onClick={() => { removePicture(); setPicOpen(false); }}
                  disabled={removingPic}
                  className="rounded-sm border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 font-display uppercase tracking-widest text-xs">
                  {removingPic ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ImageOff className="w-3.5 h-3.5 mr-1" />}
                  Remove manual picture
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPicOpen(false)} className="rounded-sm text-slate-400 hover:text-white">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Contact Info Dialog ─────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 rounded-sm sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-tight text-white">
              Edit Info · @{profile.username}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Add alternate accounts, contact details, and social links.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Alt Instagram accounts */}
            <ListEditor
              label="Alt Instagram Accounts"
              icon={Instagram}
              items={editAltIg}
              placeholder="@otheraccount or URL"
              onChange={setEditAltIg}
            />

            {/* Phone numbers */}
            <ListEditor
              label="Phone Numbers"
              icon={Phone}
              items={editPhones}
              placeholder="+1 (555) 000-0000"
              onChange={setEditPhones}
            />

            {/* Email addresses */}
            <ListEditor
              label="Email Addresses"
              icon={Mail}
              items={editEmails}
              placeholder="name@example.com"
              onChange={setEditEmails}
            />

            {/* Social platforms */}
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-3 block">
                Social Platforms
              </label>
              <div className="space-y-2">
                {SOCIAL_META.map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="w-20 font-mono text-[10px] uppercase tracking-wider text-slate-400 shrink-0 inline-flex items-center gap-1">
                      <span>{s.icon}</span> {s.label}
                    </span>
                    <Input
                      value={editSocials[s.key] || ""}
                      onChange={(e) => setEditSocials((prev) => ({ ...prev, [s.key]: e.target.value }))}
                      placeholder={s.placeholder}
                      className="bg-slate-900 border-slate-600 rounded-sm h-8 text-sm focus-visible:ring-[#0076B6] font-mono"
                    />
                    {editSocials[s.key] && (
                      <button onClick={() => setEditSocials((prev) => { const n = { ...prev }; delete n[s.key]; return n; })}
                        className="text-slate-500 hover:text-red-400 shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-2 block">
                Notes
              </label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Any notes about this person…"
                rows={3}
                className="bg-slate-900 border-slate-600 rounded-sm text-sm focus-visible:ring-[#0076B6] font-mono resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} className="rounded-sm text-slate-400 hover:text-white">Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving}
              className="rounded-sm bg-[#0076B6] hover:bg-[#0089d3] font-display uppercase tracking-widest">
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Favorite Pictures Dialog ─────────────────────────────────────────── */}
      <Dialog open={favOpen} onOpenChange={setFavOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 rounded-sm sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-tight text-white">
              Favorite Pictures · @{profile.username}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Save photos you want to keep on file for this person.
            </DialogDescription>
          </DialogHeader>

          {/* Add picture section */}
          <div className="space-y-4 border border-slate-700 rounded-sm p-4 bg-slate-900/40">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B0B7BC]">Add a picture</div>

            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-2 inline-flex items-center gap-1.5">
                <LinkIcon className="w-3 h-3" /> Caption (optional)
              </label>
              <Input
                value={favCaption}
                onChange={(e) => setFavCaption(e.target.value)}
                placeholder="e.g. Game day, Jan 2025"
                className="bg-slate-900 border-slate-600 rounded-sm h-9 text-sm focus-visible:ring-[#0076B6] font-mono"
              />
            </div>

            <div className="flex gap-2">
              <Input
                value={favUrl}
                onChange={(e) => setFavUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitFavUrl()}
                placeholder="https://…/photo.jpg"
                className="bg-slate-900 border-slate-600 rounded-sm h-9 text-sm focus-visible:ring-[#0076B6] font-mono"
              />
              <Button onClick={submitFavUrl} disabled={favUploading || !favUrl.trim()} size="sm"
                className="rounded-sm bg-[#0076B6] hover:bg-[#0089d3] font-display uppercase tracking-widest h-9 px-3 shrink-0">
                {favUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add URL"}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">or upload</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>

            <input
              ref={favFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => submitFavUpload(e.target.files?.[0])}
              disabled={favUploading}
              className="block w-full text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border-0 file:font-mono file:text-[10px] file:uppercase file:tracking-widest file:bg-[#0076B6] file:text-white hover:file:bg-[#0089d3] disabled:opacity-50"
            />
          </div>

          {/* Gallery */}
          {favPictures.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
              {favPictures.map((fp) => (
                <div key={fp.id} className="group/pic relative rounded-sm overflow-hidden border border-slate-700 bg-slate-900 aspect-square">
                  <img
                    src={proxyImg(fp.url)}
                    alt={fp.caption || "Favorite"}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                  {fp.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1 font-mono text-[9px] text-slate-300 truncate">
                      {fp.caption}
                    </div>
                  )}
                  <button
                    onClick={() => deleteFavPic(fp.id)}
                    disabled={deletingFavId === fp.id}
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover/pic:opacity-100 transition-opacity bg-black/70 hover:bg-red-500/80 text-white rounded-sm p-1"
                    title="Remove"
                  >
                    {deletingFavId === fp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 font-mono text-xs uppercase tracking-widest">
              No favorite pictures yet
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setFavOpen(false)} className="rounded-sm text-slate-400 hover:text-white">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
