import { useRef, useState } from "react";
import {
  BadgeCheck, ExternalLink, RefreshCw, Trash2, Tag, Image as ImageIcon,
  Upload, Link as LinkIcon, Loader2, Star, ImageOff, Edit2, X, Plus,
  Phone, Mail, Instagram, Camera, ChevronDown, ChevronUp, Info,
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
      className={`font-mono text-[10px] uppercase tracking-wider border border-dashed border-slate-600 text-slate-400 px-2 py-0.5 rounded-md hover:border-[#B0B7BC] hover:text-[#B0B7BC] inline-flex items-center gap-1 ${className}`}
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
          className="bg-slate-900 border-slate-600 rounded-md h-9 text-sm focus-visible:ring-[#0076B6] font-mono"
        />
        <Button onClick={add} disabled={!draft.trim()} size="sm"
          className="rounded-md bg-[#0076B6] hover:bg-[#0089d3] font-display uppercase tracking-widest h-9 px-3">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-700/60 border border-slate-600 text-slate-300 px-2 py-0.5 rounded-md">
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
  const [editName, setEditName] = useState(profile.full_name || "");
  const [editAddress, setEditAddress] = useState(profile.home_address || "");
  const [editAltIgs, setEditAltIgs] = useState(profile.alt_instagrams || []);
  const [editPhones, setEditPhones] = useState(profile.phones || []);
  const [editEmails, setEditEmails] = useState(profile.emails || []);
  const [editSocials, setEditSocials] = useState(profile.socials || {});
  const [editNotes, setEditNotes] = useState(profile.notes || "");
  const [savingEdit, setSavingEdit] = useState(false);

  // Fav pictures state
  const [favOpen, setFavOpen] = useState(false);
  const [favPictures, setFavPictures] = useState(profile.fav_pictures || []);
  const [favUrl, setFavUrl] = useState("");
  const [favCaption, setFavCaption] = useState("");
  const [favAdding, setFavAdding] = useState(false);
  const [favUploading, setFavUploading] = useState(false);
  const [deletingFavId, setDeletingFavId] = useState(null);
  const favFileRef = useRef(null);

  // Social links expand
  const [socialsExpanded, setSocialsExpanded] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  
  // Photo lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxPhotoId, setLightboxPhotoId] = useState(null);
  const [deletePhotoConfirmId, setDeletePhotoConfirmId] = useState(null);
  const [profilePicLightboxOpen, setProfilePicLightboxOpen] = useState(false);

  // Online status
  const [isOnline, setIsOnline] = useState(profile.is_online || false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  const initials = (profile.username || "?").slice(0, 2).toUpperCase();
  const igUrl = `https://instagram.com/${profile.username}`;
  const isManual = profile.pic_source === "manual";

  const refresh = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/profiles/${profile.id}/refresh`);
      onChange(data);
      toast.success(`Updated @${data.username}`);
    } catch {
      toast.error("Refresh failed");
    } finally {
      setBusy(false);
    }
  };

  const setManualUrl = async () => {
    if (!picUrl.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/profiles/${profile.id}/picture/url`, { url: picUrl });
      onChange(data);
      setPicUrl(""); setPicOpen(false);
      toast.success("Picture URL updated");
    } catch { toast.error("Update failed"); }
    finally { setBusy(false); }
  };

  const uploadPic = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post(`/profiles/${profile.id}/picture/upload`, fd);
      onChange(data);
      setPicOpen(false);
      toast.success("Photo uploaded");
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); }
  };

  const removePic = async () => {
    setRemovingPic(true);
    try {
      const { data } = await api.delete(`/profiles/${profile.id}/picture`);
      onChange(data);
      setPicOpen(false);
      toast.success("Picture removed");
    } catch { toast.error("Remove failed"); }
    finally { setRemovingPic(false); }
  };

  const toggleCategory = async (cid) => {
    const ids = profile.category_ids || [];
    const newIds = ids.includes(cid) ? ids.filter((x) => x !== cid) : [...ids, cid];
    try {
      const { data } = await api.patch(`/profiles/${profile.id}`, { category_ids: newIds });
      onChange(data);
    } catch { toast.error("Update failed"); }
  };

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      const payload = {
        full_name: editName,
        home_address: editAddress,
        alt_instagrams: editAltIgs,
        phones: editPhones,
        emails: editEmails,
        socials: editSocials,
        notes: editNotes,
      };
      const { data } = await api.patch(`/profiles/${profile.id}`, payload);
      onChange(data);
      setEditOpen(false);
      toast.success("Profile updated");
    } catch { toast.error("Save failed"); }
    finally { setSavingEdit(false); }
  };

  const addFavUrl = async () => {
    if (!favUrl.trim()) return;
    setFavAdding(true);
    try {
      const { data } = await api.post(`/profiles/${profile.id}/fav-pictures/url`, { url: favUrl, caption: favCaption });
      setFavPictures(data.fav_pictures);
      onChange(data);
      setFavUrl(""); setFavCaption("");
      toast.success("Photo added to gallery");
    } catch { toast.error("Failed to add photo"); }
    finally { setFavAdding(false); }
  };

  const uploadFavPic = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFavUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    if (favCaption) fd.append("caption", favCaption);
    try {
      const { data } = await api.post(`/profiles/${profile.id}/fav-pictures/upload`, fd);
      setFavPictures(data.fav_pictures);
      onChange(data);
      setFavCaption("");
      toast.success("Photo uploaded to gallery");
    } catch { toast.error("Upload failed"); }
    finally { setFavUploading(false); }
  };

  const deleteFavPic = async (picId) => {
    setDeletingFavId(picId);
    try {
      const { data } = await api.delete(`/profiles/${profile.id}/fav-pictures/${picId}`);
      setFavPictures(data.fav_pictures);
      onChange(data);
      toast.success("Photo removed");
    } catch { toast.error("Remove failed"); }
    finally { setDeletingFavId(null); }
  };

  const toggleOnline = async () => {
    setTogglingOnline(true);
    try {
      const newStatus = !isOnline;
      const { data } = await api.patch(`/profiles/${profile.id}/online`, { is_online: newStatus });
      setIsOnline(data.is_online);
      onChange(data);
      toast.success(newStatus ? "Marked as online" : "Marked as offline");
    } catch { toast.error("Update failed"); }
    finally { setTogglingOnline(false); }
  };

  const checkActivity = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/profiles/${profile.id}/check-activity`);
      onChange(data);
      toast.success("Activity checked");
    } catch { toast.error("Check failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="relative bg-slate-800 border-2 border-[#B0B7BC] rounded-lg overflow-hidden group hover:border-slate-400 transition-colors shadow-lg">
      {/* ── Profile Picture Section ────────────────────────────────────────── */}
      <div className="relative bg-slate-900 aspect-square overflow-hidden">
        {/* Instagram-style online ring */}
        {isOnline && (
          <div className="absolute inset-0 rounded-lg z-0" style={{
            background: 'conic-gradient(from 45deg, #feda75 0deg, #fa7e1e 40deg, #d92e7f 102deg, #9b36b7 169deg, #515bd4 180deg)',
            padding: '3px'
          }}>
            <div className="absolute inset-[3px] bg-slate-900 rounded-lg" />
          </div>
        )}

        <button
          onClick={() => setProfilePicLightboxOpen(true)}
          className="absolute inset-0 w-full h-full opacity-0 hover:opacity-100 transition-opacity bg-black/20 flex items-center justify-center rounded-lg z-10"
          title="View full size"
        >
          <span className="text-white text-sm font-semibold">View</span>
        </button>

        {profile.profile_pic_url && !imgErr ? (
          <img
            src={proxyImg(profile.profile_pic_url)}
            alt={profile.username}
            onError={() => setImgErr(true)}
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${isOnline ? 'p-1.5 rounded-lg' : ''}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-500 font-display text-4xl font-black">
            {initials}
          </div>
        )}

        {/* Status Indicators */}
        <div className="absolute top-2 left-2 flex flex-col gap-1.5 z-20">
          {profile.has_new_story && (
            <div className="w-3 h-3 rounded-full bg-pink-500 border-2 border-slate-900 shadow-sm" title="New Story" />
          )}
          {profile.has_new_post && (
            <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-slate-900 shadow-sm" title="New Post" />
          )}
        </div>

        <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={refresh} disabled={busy} className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-md backdrop-blur-sm" title="Refresh from Instagram">
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setPicOpen(true)} className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-md backdrop-blur-sm" title="Change Photo">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={checkActivity} disabled={busy} className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-md backdrop-blur-sm" title="Check Activity">
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>

        {isManual && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm text-[9px] font-mono text-white/80 rounded-md flex items-center gap-1 border border-white/10 z-20">
            <ImageIcon className="w-2.5 h-2.5" /> MANUAL
          </div>
        )}
      </div>

      {/* ── Content Section ────────────────────────────────────────────────── */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <a href={igUrl} target="_blank" rel="noreferrer" className="font-display text-base font-bold text-white hover:text-[#0076B6] truncate flex items-center gap-1">
                @{profile.username}
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
              {profile.is_verified && <BadgeCheck className="w-4 h-4 text-[#0076B6] shrink-0" />}
            </div>
            <div className="font-display text-sm font-bold text-white/90 truncate">
              {profile.full_name || "No Name"}
            </div>
          </div>
          
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={toggleOnline}
              disabled={togglingOnline}
              className={`h-7 px-2 rounded-md font-mono text-[10px] uppercase tracking-wider font-bold flex items-center justify-center gap-1 transition-colors ${
                isOnline
                  ? "bg-green-600/20 hover:bg-green-600/30 text-green-400"
                  : "bg-slate-700/20 hover:bg-slate-700/30 text-slate-400"
              }`}
              title={isOnline ? "Mark offline" : "Mark online"}
            >
              {togglingOnline ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="text-[12px]">●</span>}
            </button>
          </div>
        </div>

        {profile.bio && (
          <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed italic">
            &ldquo;{profile.bio}&rdquo;
          </p>
        )}

        {/* Contact Info Summary */}
        <div className="space-y-1.5 mb-4 border-t border-slate-700/50 pt-3">
          {(profile.alt_instagrams || []).length > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <Instagram className="w-3 h-3 shrink-0 text-[#0076B6]" />
              <span className="truncate">{(profile.alt_instagrams || []).join(", ")}</span>
            </div>
          )}
          {(profile.phones || []).length > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <Phone className="w-3 h-3 shrink-0 text-[#0076B6]" />
              <span className="truncate">{(profile.phones || []).join(", ")}</span>
            </div>
          )}
          {(profile.emails || []).length > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <Mail className="w-3 h-3 shrink-0 text-[#0076B6]" />
              <span className="truncate">{(profile.emails || []).join(", ")}</span>
            </div>
          )}
          
          {/* Social Links Toggle */}
          {Object.values(profile.socials || {}).some(v => v) && (
            <div className="pt-1">
              <button 
                onClick={() => setSocialsExpanded(!socialsExpanded)}
                className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-[#0076B6] hover:text-[#0089d3]"
              >
                {socialsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {socialsExpanded ? "Hide Socials" : "Show Socials"}
              </button>
              
              {socialsExpanded && (
                <div className="mt-2 grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {SOCIAL_META.map(meta => {
                    const val = (profile.socials || {})[meta.key];
                    if (!val) return null;
                    return (
                      <div key={meta.key} className="flex items-center gap-1.5 bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1 overflow-hidden">
                        <span className="text-xs shrink-0">{meta.icon}</span>
                        <span className="text-[10px] font-mono text-slate-300 truncate" title={val}>{val}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {categories.map((c) => {
            const active = (profile.category_ids || []).includes(c.id);
            if (!active) return null;
            return (
              <span key={c.id} className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-md border ${c.system ? "bg-[#0076B6]/10 border-[#0076B6]/40 text-[#7cc6e8]" : "bg-slate-700/40 border-slate-600 text-slate-400"}`}>
                {c.name}
              </span>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-6 h-6 flex items-center justify-center rounded-md border border-dashed border-slate-600 text-slate-500 hover:border-[#0076B6] hover:text-[#0076B6] transition-colors">
                <Plus className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-slate-800 border-slate-700 rounded-md w-48">
              <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Categories</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-700" />
              {categories.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={(profile.category_ids || []).includes(c.id)}
                  onCheckedChange={() => toggleCategory(c.id)}
                  className="font-mono text-[11px] uppercase tracking-wider focus:bg-[#0076B6]/20 focus:text-white"
                >
                  {c.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Action Row */}
        <div className="flex items-center justify-between border-t border-slate-700/50 pt-4">
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setViewDetailsOpen(true)}
              className="p-2 bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 rounded-md transition-colors" 
              title="View Details"
            >
              <Info className="w-4 h-4" />
            </button>
            <button 
              onClick={() => {
                setEditName(profile.full_name || "");
                setEditAddress(profile.home_address || "");
                setEditAltIgs(profile.alt_instagrams || []);
                setEditPhones(profile.phones || []);
                setEditEmails(profile.emails || []);
                setEditSocials(profile.socials || {});
                setEditNotes(profile.notes || "");
                setEditOpen(true);
              }}
              className="p-2 bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 rounded-md transition-colors" 
              title="Edit Profile"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setFavOpen(true)}
              className="p-2 bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 rounded-md transition-colors relative" 
              title="Favorite Pictures"
            >
              <Camera className="w-4 h-4" />
              {favPictures.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#0076B6] text-white text-[9px] font-bold flex items-center justify-center rounded-full border-2 border-slate-800">
                  {favPictures.length}
                </span>
              )}
            </button>
          </div>
          
          <button 
            onClick={() => setDeleteConfirmOpen(true)}
            className="p-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-md transition-colors" 
            title="Delete Profile"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        
        {profile.last_login && (
          <div className="mt-3 font-mono text-[9px] text-slate-500 uppercase tracking-widest text-center">
            Last active: {new Date(profile.last_login).toLocaleString()}
          </div>
        )}

        {/* Follower Images */}
        {(profile.follower_images || []).length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-700/50">
            <div className="font-mono text-[9px] uppercase tracking-widest text-slate-500 mb-2">Followers in Rolodex</div>
            <div className="flex -space-x-2 overflow-hidden">
              {profile.follower_images.slice(0, 5).map((img, i) => (
                <div key={i} className="inline-block h-6 w-6 rounded-full ring-2 ring-slate-800 border border-[#B0B7BC] overflow-hidden bg-slate-700">
                  <img src={proxyImg(img)} className="h-full w-full object-cover" />
                </div>
              ))}
              {profile.follower_images.length > 5 && (
                <div className="flex items-center justify-center h-6 w-6 rounded-full ring-2 ring-slate-800 bg-slate-700 text-[9px] font-bold text-slate-300 border border-[#B0B7BC]">
                  +{profile.follower_images.length - 5}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── View Details Dialog ───────────────────────────────────────────── */}
      <Dialog open={viewDetailsOpen} onOpenChange={setViewDetailsOpen}>
        <DialogContent className="bg-slate-800 border-2 border-[#B0B7BC] rounded-lg sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-black uppercase tracking-tight text-white flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg border-2 border-[#B0B7BC] overflow-hidden shrink-0">
                <img src={proxyImg(profile.profile_pic_url)} className="w-full h-full object-cover" />
              </div>
              <div>
                <div>@{profile.username}</div>
                <div className="text-sm font-bold text-[#B0B7BC] normal-case">{profile.full_name}</div>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Address */}
            {profile.home_address && (
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0076B6] block mb-2">Home Address</label>
                <div className="bg-slate-900/60 border border-slate-700 p-3 rounded-md text-sm text-slate-300 whitespace-pre-wrap leading-relaxed border-l-4 border-l-[#B0B7BC]">
                  {profile.home_address}
                </div>
              </div>
            )}

            {/* Contact Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(profile.phones || []).length > 0 && (
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0076B6] block mb-2">Phone Numbers</label>
                  <div className="space-y-1">
                    {profile.phones.map((p, i) => (
                      <div key={i} className="font-mono text-xs text-slate-300 flex items-center gap-2">
                        <Phone className="w-3 h-3 text-slate-500" /> {p}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(profile.emails || []).length > 0 && (
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0076B6] block mb-2">Email Addresses</label>
                  <div className="space-y-1">
                    {profile.emails.map((e, i) => (
                      <div key={i} className="font-mono text-xs text-slate-300 flex items-center gap-2">
                        <Mail className="w-3 h-3 text-slate-500" /> {e}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Socials */}
            {Object.values(profile.socials || {}).some(v => v) && (
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0076B6] block mb-2">Social Media</label>
                <div className="grid grid-cols-2 gap-2">
                  {SOCIAL_META.map(meta => {
                    const val = (profile.socials || {})[meta.key];
                    if (!val) return null;
                    return (
                      <div key={meta.key} className="flex items-center gap-2 bg-slate-900/60 border border-slate-700 p-2 rounded-md">
                        <span className="text-lg">{meta.icon}</span>
                        <div className="min-w-0">
                          <div className="text-[9px] font-mono text-slate-500 uppercase">{meta.label}</div>
                          <div className="text-xs text-slate-300 truncate">{val}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            {profile.notes && (
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0076B6] block mb-2">Notes</label>
                <div className="bg-slate-900/60 border border-slate-700 p-3 rounded-md text-sm text-slate-300 whitespace-pre-wrap leading-relaxed italic">
                  &ldquo;{profile.notes}&rdquo;
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between items-center border-t border-slate-700 pt-4">
            <div className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">Added {new Date(profile.created_at).toLocaleDateString()}</div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setViewDetailsOpen(false)} className="rounded-md text-slate-400 hover:text-white">Close</Button>
              <Button onClick={() => { setViewDetailsOpen(false); setEditOpen(true); }} className="rounded-md bg-[#0076B6] hover:bg-[#0089d3] font-display uppercase tracking-widest">Edit</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Profile Dialog ───────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-slate-800 border-2 border-[#B0B7BC] rounded-lg sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-black uppercase tracking-tight text-white">Edit Profile Details</DialogTitle>
            <DialogDescription className="text-slate-400">Update contact info, social links, and private notes for @{profile.username}.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            <div className="space-y-5">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-2 block">Real Name</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Full Name"
                  className="bg-slate-900 border-slate-600 rounded-md h-10 text-sm focus-visible:ring-[#0076B6]" />
              </div>
              
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-2 block">Home Address</label>
                <Textarea value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Street, City, State, ZIP"
                  className="bg-slate-900 border-slate-600 rounded-md min-h-[80px] text-sm focus-visible:ring-[#0076B6] leading-relaxed" />
              </div>

              <ListEditor label="Alt Instagrams" items={editAltIgs} onChange={setEditAltIgs} placeholder="other_handle" icon={Instagram} />
              <ListEditor label="Phone Numbers" items={editPhones} onChange={setEditPhones} placeholder="555-0123" icon={Phone} />
              <ListEditor label="Email Addresses" items={editEmails} onChange={setEditEmails} placeholder="name@example.com" icon={Mail} />
            </div>

            <div className="space-y-5">
              <div className="space-y-3">
                <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 block">Social Media</label>
                <div className="grid grid-cols-1 gap-3">
                  {SOCIAL_META.map(meta => (
                    <div key={meta.key} className="flex items-center gap-2">
                      <span className="text-lg w-6 flex justify-center">{meta.icon}</span>
                      <Input 
                        value={editSocials[meta.key] || ""} 
                        onChange={(e) => setEditSocials({...editSocials, [meta.key]: e.target.value})}
                        placeholder={meta.placeholder}
                        className="bg-slate-900 border-slate-600 rounded-md h-9 text-xs focus-visible:ring-[#0076B6]"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-2 block">Private Notes</label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Add any extra details here..."
                  className="bg-slate-900 border-slate-600 rounded-md min-h-[100px] text-sm focus-visible:ring-[#0076B6] leading-relaxed italic" />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-700 pt-4">
            <Button variant="ghost" onClick={() => setEditOpen(false)} className="rounded-md text-slate-400 hover:text-white">Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit} className="rounded-md bg-[#0076B6] hover:bg-[#0089d3] font-display uppercase tracking-widest px-8">
              {savingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Profile Picture Source Dialog ──────────────────────────────────── */}
      <Dialog open={picOpen} onOpenChange={setPicOpen}>
        <DialogContent className="bg-slate-800 border-2 border-[#B0B7BC] rounded-lg sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-tight">Change Profile Photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Option 1: Image URL</label>
              <div className="flex gap-2">
                <Input value={picUrl} onChange={(e) => setPicUrl(e.target.value)} placeholder="https://..."
                  className="bg-slate-900 border-slate-600 rounded-md h-10 focus-visible:ring-[#0076B6]" />
                <Button onClick={setManualUrl} disabled={busy || !picUrl.trim()} size="sm" className="rounded-md bg-[#0076B6] hover:bg-[#0089d3]">Set</Button>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-700" /></div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest"><span className="bg-slate-800 px-2 text-slate-500">OR</span></div>
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Option 2: Upload File</label>
              <input type="file" ref={fileRef} onChange={uploadPic} className="hidden" accept="image/*" />
              <Button onClick={() => fileRef.current?.click()} disabled={uploading} variant="outline" className="w-full h-10 rounded-md border-slate-600 border-dashed text-slate-300 hover:bg-slate-700">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                {uploading ? "Uploading..." : "Select Image from Device"}
              </Button>
            </div>
            {profile.profile_pic_url && (
              <Button onClick={removePic} disabled={removingPic} variant="ghost" className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-md">
                {removingPic ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Remove Current Photo
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Favorite Pictures Dialog ───────────────────────────────────────── */}
      <Dialog open={favOpen} onOpenChange={setFavOpen}>
        <DialogContent className="bg-slate-800 border-2 border-[#B0B7BC] rounded-lg sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-black uppercase tracking-tight text-white">Favorite Pictures Gallery</DialogTitle>
            <DialogDescription className="text-slate-400">Add and manage a collection of photos for @{profile.username}.</DialogDescription>
          </DialogHeader>

          <div className="bg-slate-900/60 border border-slate-700 p-4 rounded-lg mb-6">
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Input value={favUrl} onChange={(e) => setFavUrl(e.target.value)} placeholder="Image URL (https://...)"
                  className="bg-slate-800 border-slate-600 rounded-md h-10 text-sm focus-visible:ring-[#0076B6]" />
                <Button onClick={addFavUrl} disabled={favAdding || !favUrl.trim()} className="rounded-md bg-[#0076B6] hover:bg-[#0089d3] h-10 px-4">
                  {favAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input value={favCaption} onChange={(e) => setFavCaption(e.target.value)} placeholder="Add a caption (optional)"
                  className="bg-slate-800 border-slate-600 rounded-md h-9 text-xs focus-visible:ring-[#0076B6]" />
                <input type="file" ref={favFileRef} onChange={uploadFavPic} className="hidden" accept="image/*" />
                <Button onClick={() => favFileRef.current?.click()} disabled={favUploading} variant="outline" className="rounded-md border-slate-600 border-dashed h-9 px-3 text-slate-400">
                  {favUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          {favPictures.length > 0 ? (
            <div className="grid grid-cols-4 gap-3">
              {favPictures.map((fp) => (
                <div key={fp.id} className="relative group/pic aspect-square bg-slate-700 rounded-lg overflow-hidden border border-[#B0B7BC]">
                  <img src={proxyImg(fp.url)} alt={fp.caption || "Fav"} className="w-full h-full object-cover" />
                  {fp.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1 font-mono text-[9px] text-slate-300 truncate">
                      {fp.caption}
                    </div>
                  )}
                  <button
                    onClick={() => setDeletePhotoConfirmId(fp.id)}
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover/pic:opacity-100 transition-opacity bg-black/70 hover:bg-red-500/80 text-white rounded-md p-1 z-20"
                    title="Remove"
                  >
                    {deletingFavId === fp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => { setLightboxPhotoId(fp.id); setLightboxOpen(true); }}
                    className="absolute inset-0 w-full h-full opacity-0 hover:opacity-100 transition-opacity bg-black/20 flex items-center justify-center rounded-lg z-10"
                    title="View full size"
                  >
                    <span className="text-white text-xs font-bold uppercase tracking-widest bg-black/40 px-2 py-1 rounded-md backdrop-blur-sm">View</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center border border-dashed border-slate-700 rounded-lg">
              <ImageIcon className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
              <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                No favorite pictures yet
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setFavOpen(false)} className="rounded-md text-slate-400 hover:text-white">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Photo Lightbox Dialog ─────────────────────────────────────────── */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="bg-black border-slate-700 rounded-lg sm:max-w-4xl max-h-[90vh] p-0">
          {lightboxPhotoId && (() => {
            const photo = favPictures.find((fp) => fp.id === lightboxPhotoId);
            if (!photo) return null;
            return (
              <div className="relative w-full h-full flex flex-col">
                <div className="flex-1 flex items-center justify-center bg-black">
                  <img
                    src={proxyImg(photo.url)}
                    alt={photo.caption || "Photo"}
                    className="max-w-full max-h-[80vh] object-contain rounded-lg"
                  />
                </div>
                {photo.caption && (
                  <div className="bg-slate-900 border-t border-slate-700 px-4 py-3 font-mono text-sm text-slate-300">
                    {photo.caption}
                  </div>
                )}
                <button
                  onClick={() => setLightboxOpen(false)}
                  className="absolute top-2 right-2 bg-black/70 hover:bg-red-500/80 text-white rounded-lg p-2"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Profile Picture Lightbox Dialog ──────────────────────────────── */}
      <Dialog open={profilePicLightboxOpen} onOpenChange={setProfilePicLightboxOpen}>
        <DialogContent className="bg-black border-slate-700 rounded-lg sm:max-w-4xl max-h-[90vh] p-0">
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <img
              src={proxyImg(profile.profile_pic_url)}
              alt={profile.username}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setProfilePicLightboxOpen(false)}
              className="absolute top-2 right-2 bg-black/70 hover:bg-red-500/80 text-white rounded-lg p-2"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Photo Confirmation Dialog ──────────────────────────────── */}
      <AlertDialog open={deletePhotoConfirmId !== null} onOpenChange={(open) => !open && setDeletePhotoConfirmId(null)}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display uppercase tracking-tight text-red-400">Delete Favorite Photo?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently remove this photo from the gallery. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md bg-slate-700 border-slate-600 hover:bg-slate-600 text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletePhotoConfirmId) deleteFavPic(deletePhotoConfirmId);
                setDeletePhotoConfirmId(null);
              }}
              className="rounded-md bg-red-600 hover:bg-red-700 text-white border-0 font-display uppercase tracking-widest"
            >
              Delete Photo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Profile Confirmation Dialog ────────────────────────────── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display uppercase tracking-tight text-red-400">Remove from Rolodex?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete @{profile.username}? All contact info, notes, and favorite pictures will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md bg-slate-700 border-slate-600 hover:bg-slate-600 text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => onDelete(profile.id)}
              className="rounded-md bg-red-600 hover:bg-red-700 text-white border-0 font-display uppercase tracking-widest"
            >
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
