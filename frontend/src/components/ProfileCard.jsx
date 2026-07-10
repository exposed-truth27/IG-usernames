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

const SOCIAL_META = [
  { key: "snapchat",  label: "Snapchat",  placeholder: "username",        color: "#FFFC00", icon: "👻" },
  { key: "tiktok",    label: "TikTok",    placeholder: "@username",        color: "#ff0050", icon: "🎵" },
  { key: "facebook",  label: "Facebook",  placeholder: "profile or page",  color: "#1877F2", icon: "📘" },
  { key: "twitter",   label: "X / Twitter", placeholder: "@handle",        color: "#1DA1F2", icon: "🐦" },
  { key: "youtube",   label: "YouTube",   placeholder: "@channel or URL",  color: "#FF0000", icon: "▶️" },
  { key: "threads",   label: "Threads",   placeholder: "@username",        color: "#000000", icon: "🧵" },
];

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
          className="bg-slate-900 border-slate-600 rounded-xl h-9 text-sm focus-visible:ring-[#0076B6] font-mono"
        />
        <Button onClick={add} disabled={!draft.trim()} size="sm"
          className="rounded-xl bg-[#0076B6] hover:bg-[#0089d3] font-display uppercase tracking-widest h-9 px-3">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-700/60 border border-slate-600 text-slate-300 px-2 py-0.5 rounded-lg">
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

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(profile.full_name || "");
  const [editAddress, setEditAddress] = useState(profile.home_address || "");
  const [editAltIgs, setEditAltIgs] = useState(profile.alt_instagrams || []);
  const [editPhones, setEditPhones] = useState(profile.phones || []);
  const [editEmails, setEditEmails] = useState(profile.emails || []);
  const [editSocials, setEditSocials] = useState(profile.socials || {});
  const [editNotes, setEditNotes] = useState(profile.notes || "");
  const [editFollowerIds, setEditFollowerIds] = useState(profile.mutual_follower_ids || []);
  const [savingEdit, setSavingEdit] = useState(false);
  const [importHtmlOpen, setImportHtmlOpen] = useState(false);
  const [pastedHtml, setPastedHtml] = useState("");
  const [importingHtml, setImportingHtml] = useState(false);

  const [favOpen, setFavOpen] = useState(false);
  const [favPictures, setFavPictures] = useState(profile.fav_pictures || []);
  const [favUrl, setFavUrl] = useState("");
  const [favCaption, setFavCaption] = useState("");
  const [favAdding, setFavAdding] = useState(false);
  const [favUploading, setFavUploading] = useState(false);
  const [deletingFavId, setDeletingFavId] = useState(null);
  const favFileRef = useRef(null);

  const [socialsExpanded, setSocialsExpanded] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxPhotoId, setLightboxPhotoId] = useState(null);
  const [deletePhotoConfirmId, setDeletePhotoConfirmId] = useState(null);
  const [profilePicLightboxOpen, setProfilePicLightboxOpen] = useState(false);

  const [isOnline, setIsOnline] = useState(profile.is_online || false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  const initials = (profile.username || "?").slice(0, 2).toUpperCase();
  const igUrl = `https://instagram.com/${profile.username}`;
  // Manual tag removed as requested
  const hasUpdate = profile.has_new_story || profile.has_new_post;
  const isFavorite = (profile.category_ids || []).includes("__sys_favorite");
  const isActive = (profile.category_ids || []).includes("__sys_active");
  const isComplete = (profile.category_ids || []).includes("__sys_complete");

  const refresh = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/profiles/${profile.id}/refresh`);
      onChange(data);
      toast.success(`Updated @${data.username}`);
    } catch { toast.error("Refresh failed"); }
    finally { setBusy(false); }
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

  const importHtml = async () => {
    if (!pastedHtml.trim()) return;
    setImportingHtml(true);
    try {
      const { data } = await api.post(`/profiles/${profile.id}/import-html`, { html: pastedHtml });
      onChange(data);
      setImportHtmlOpen(false);
      setPastedHtml("");
      toast.success("Data imported from HTML");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed");
    } finally {
      setImportingHtml(false);
    }
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
        mutual_follower_ids: editFollowerIds,
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
    <div className={`relative bg-slate-800 border-2 border-[#B0B7BC] rounded-2xl overflow-hidden group transition-all duration-300 ${
      isFavorite 
        ? "shadow-[0_0_50px_rgba(224,225,226,0.95)] hover:shadow-[0_0_70px_rgba(224,225,226,1.0)] border-white ring-4 ring-white/20" 
        : "shadow-lg hover:shadow-xl hover:border-white/40"
    }`}>
      {/* ── Profile Header Section (Circle Avatar) ─────────────────────────── */}
      <div className="relative p-6 flex flex-col items-center bg-slate-900/40">
        {/* Profile Picture with Instagram-style ring (Online or Update) */}
        <div className="relative w-28 h-28 mb-4">
          {(isOnline || hasUpdate || isActive || isComplete) && (
            <div className="absolute inset-[-5px] rounded-full z-0" style={{
              background: isOnline 
                ? 'conic-gradient(from 45deg, #feda75 0deg, #fa7e1e 40deg, #d92e7f 102deg, #9b36b7 169deg, #515bd4 180deg)'
                : hasUpdate
                ? 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'
                : isActive
                ? '#22c55e'
                : '#000000',
              padding: '3px'
            }}>
              <div className="absolute inset-[2px] bg-slate-900 rounded-full" />
            </div>
          )}

          <div className="relative w-full h-full rounded-full border-2 border-[#B0B7BC] overflow-hidden bg-slate-800 z-10 group/avatar shadow-lg">
            <button
              onClick={() => setProfilePicLightboxOpen(true)}
              className="absolute inset-0 w-full h-full opacity-0 group-hover/avatar:opacity-100 transition-opacity bg-black/40 flex items-center justify-center z-20"
              title="View full size"
            >
              <span className="text-white text-[11px] font-black uppercase tracking-widest">View</span>
            </button>

            {profile.profile_pic_url && !imgErr ? (
              <img
                src={proxyImg(profile.profile_pic_url)}
                alt={profile.username}
                onError={() => setImgErr(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500 font-display text-3xl font-black">
                {initials}
              </div>
            )}
          </div>

          {/* Status Indicators */}
          <div className="absolute -bottom-1 -right-1 flex flex-col gap-1 z-20">
            {profile.has_new_story && (
              <div className="w-5 h-5 rounded-full bg-pink-500 border-2 border-slate-900 shadow-xl" title="New Story" />
            )}
            {profile.has_new_post && (
              <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-slate-900 shadow-xl" title="New Post" />
            )}
          </div>
          
          {/* Favorite Star Icon */}
          {(profile.category_ids || []).includes("__sys_favorite") && (
            <div className="absolute -top-1 -left-1 z-20">
              <Star className="w-6 h-6 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
            </div>
          )}
        </div>

        {/* Quick Actions (Floating) */}
        <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={refresh} disabled={busy} className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm border border-white/10" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setPicOpen(true)} className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm border border-white/10" title="Photo">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Manual tag removed */}
      </div>

      {/* ── Content Section ────────────────────────────────────────────────── */}
      <div className="p-5 pt-2">
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <a href={igUrl} target="_blank" rel="noreferrer" className="font-display text-lg font-black uppercase tracking-tight text-white hover:text-[#0076B6] truncate flex items-center gap-1">
                @{profile.username}
                <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
              {profile.is_verified && <BadgeCheck className="w-4 h-4 text-[#0076B6] shrink-0" />}
            </div>
            <div className="font-display text-sm font-bold text-[#B0B7BC] truncate">
              {profile.full_name || "No Name"}
            </div>
          </div>
          
          <button
            onClick={toggleOnline}
            disabled={togglingOnline}
            className={`h-8 px-2.5 rounded-lg font-mono text-[10px] uppercase tracking-widest font-black flex items-center justify-center gap-1.5 transition-all ${
              isOnline
                ? "bg-green-600/20 border border-green-500/50 text-green-400 shadow-[0_0_10px_rgba(34,197,94,0.2)]"
                : "bg-slate-700/20 border border-slate-600 text-slate-500"
            }`}
          >
            {togglingOnline ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="text-[14px]">●</span>}
            <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
          </button>
        </div>

        {profile.bio && (
          <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed italic border-l-2 border-[#0076B6]/30 pl-3">
            &ldquo;{profile.bio}&rdquo;
          </p>
        )}

        {/* Contact Info Summary */}
        <div className="space-y-2 mb-5 bg-slate-900/30 p-3 rounded-xl border border-slate-700/50">
          {(profile.alt_instagrams || []).length > 0 && (
            <div className="flex items-center gap-2.5 text-[11px] text-slate-300 font-mono">
              <Instagram className="w-3.5 h-3.5 shrink-0 text-[#0076B6]" />
              <span className="truncate">{(profile.alt_instagrams || []).join(", ")}</span>
            </div>
          )}
          {(profile.phones || []).length > 0 && (
            <div className="flex items-center gap-2.5 text-[11px] text-slate-300 font-mono">
              <Phone className="w-3.5 h-3.5 shrink-0 text-[#0076B6]" />
              <span className="truncate">{(profile.phones || []).join(", ")}</span>
            </div>
          )}
          {(profile.emails || []).length > 0 && (
            <div className="flex items-center gap-2.5 text-[11px] text-slate-300 font-mono">
              <Mail className="w-3.5 h-3.5 shrink-0 text-[#0076B6]" />
              <span className="truncate">{(profile.emails || []).join(", ")}</span>
            </div>
          )}
          
          {Object.values(profile.socials || {}).some(v => v) && (
            <div className="pt-1">
              <button 
                onClick={() => setSocialsExpanded(!socialsExpanded)}
                className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-[#0076B6] hover:text-[#0089d3] font-bold"
              >
                {socialsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {socialsExpanded ? "Hide Networks" : "Social Networks"}
              </button>
              
              {socialsExpanded && (
                <div className="mt-3 grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                  {SOCIAL_META.map(meta => {
                    const val = (profile.socials || {})[meta.key];
                    if (!val) return null;
                    return (
                      <div key={meta.key} className="flex items-center gap-2 bg-slate-900/60 border border-slate-700 rounded-lg px-2.5 py-1.5 overflow-hidden">
                        <span className="text-xs shrink-0">{meta.icon}</span>
                        <span className="text-[10px] font-mono text-slate-300 truncate font-bold" title={val}>{val}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-2 mb-5">
          {categories.map((c) => {
            const active = (profile.category_ids || []).includes(c.id);
            if (!active) return null;
            return (
              <span key={c.id} className={`font-mono text-[9px] uppercase tracking-[0.2em] px-2.5 py-1 rounded-lg border font-bold ${c.system ? "bg-[#0076B6]/20 border-[#0076B6]/50 text-[#7cc6e8]" : "bg-slate-700/40 border-slate-600 text-slate-400"}`}>
                {c.name}
              </span>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-dashed border-slate-600 text-slate-500 hover:border-[#0076B6] hover:text-[#0076B6] transition-all hover:bg-[#0076B6]/10">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-slate-800 border-2 border-[#B0B7BC] rounded-xl w-52 shadow-2xl">
              <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-400 p-3">Categories</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-700" />
              {categories.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={(profile.category_ids || []).includes(c.id)}
                  onCheckedChange={() => toggleCategory(c.id)}
                  className="font-mono text-[11px] uppercase tracking-wider focus:bg-[#0076B6]/20 focus:text-white py-2"
                >
                  {c.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Follower Images */}
        {(profile.follower_images || []).length > 0 && (
          <div className="mb-5 p-3 bg-slate-900/20 rounded-xl border border-slate-700/30">
            <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-slate-500 mb-2.5 font-bold">Mutual Followers</div>
            <div className="flex -space-x-2.5 overflow-hidden">
              {profile.follower_images.slice(0, 6).map((img, i) => (
                <div key={i} className="inline-block h-7 w-7 rounded-full ring-2 ring-slate-800 border border-[#B0B7BC] overflow-hidden bg-slate-700 shadow-md">
                  <img src={proxyImg(img)} className="h-full w-full object-cover" />
                </div>
              ))}
              {profile.follower_images.length > 6 && (
                <div className="flex items-center justify-center h-7 w-7 rounded-full ring-2 ring-slate-800 bg-slate-700 text-[10px] font-black text-slate-300 border border-[#B0B7BC] shadow-md">
                  +{profile.follower_images.length - 6}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Row */}
        <div className="flex items-center justify-between border-t border-slate-700/50 pt-5">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setViewDetailsOpen(true)}
              className="p-2.5 bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 rounded-xl transition-all border border-slate-600/50" 
              title="Information"
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
              className="p-2.5 bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 rounded-xl transition-all border border-slate-600/50" 
              title="Edit Profile"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setFavOpen(true)}
              className="p-2.5 bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 rounded-xl transition-all border border-slate-600/50 relative" 
              title="Gallery"
            >
              <Camera className="w-4 h-4" />
              {favPictures.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#0076B6] text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-slate-800 shadow-lg">
                  {favPictures.length}
                </span>
              )}
            </button>
          </div>
          
          <button 
            onClick={() => setDeleteConfirmOpen(true)}
            className="p-2.5 bg-red-900/10 hover:bg-red-900/30 text-red-400 rounded-xl transition-all border border-red-900/20" 
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        
        {profile.last_login && (
          <div className="mt-4 font-mono text-[9px] text-slate-500 uppercase tracking-[0.3em] text-center font-bold">
            Activity: {new Date(profile.last_login).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* ── Lightbox Dialogs (Profile & Gallery) ─────────────────────────── */}
      <Dialog open={profilePicLightboxOpen} onOpenChange={setProfilePicLightboxOpen}>
        <DialogContent className="bg-black border-2 border-[#B0B7BC] rounded-2xl sm:max-w-4xl max-h-[90vh] p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          <div className="relative w-full h-full flex items-center justify-center bg-black p-4">
            <img src={proxyImg(profile.profile_pic_url)} alt={profile.username} className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-white/10" />
            <button onClick={() => setProfilePicLightboxOpen(false)} className="absolute top-4 right-4 bg-black/60 hover:bg-red-500/80 text-white rounded-xl p-3 backdrop-blur-md transition-all shadow-lg"><X className="w-6 h-6" /></button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={favOpen} onOpenChange={setFavOpen}>
        <DialogContent className="bg-slate-800 border-2 border-[#B0B7BC] rounded-2xl sm:max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
          <DialogHeader className="pb-4 border-b border-slate-700">
            <DialogTitle className="font-display text-2xl font-black uppercase tracking-tight text-white">Photo Gallery</DialogTitle>
            <DialogDescription className="text-slate-400 font-mono text-[11px] uppercase tracking-widest">Managing @{profile.username}</DialogDescription>
          </DialogHeader>

          <div className="bg-slate-900/60 border-2 border-dashed border-slate-700 p-5 rounded-2xl my-6">
            <div className="flex flex-col gap-4">
              <div className="flex gap-3">
                <Input value={favUrl} onChange={(e) => setFavUrl(e.target.value)} placeholder="Image URL (https://...)"
                  className="bg-slate-800 border-slate-600 rounded-xl h-11 text-sm focus-visible:ring-[#0076B6]" />
                <Button onClick={addFavUrl} disabled={favAdding || !favUrl.trim()} className="rounded-xl bg-[#0076B6] hover:bg-[#0089d3] h-11 px-5 shadow-lg">
                  {favAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Input value={favCaption} onChange={(e) => setFavCaption(e.target.value)} placeholder="Add a caption..."
                  className="bg-slate-800 border-slate-600 rounded-xl h-10 text-xs focus-visible:ring-[#0076B6]" />
                <input type="file" ref={favFileRef} onChange={uploadFavPic} className="hidden" accept="image/*" />
                <Button onClick={() => favFileRef.current?.click()} disabled={favUploading} variant="outline" className="rounded-xl border-slate-600 border-dashed h-10 px-4 text-slate-400 hover:bg-slate-700">
                  {favUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          </div>

          {favPictures.length > 0 ? (
            <div className="grid grid-cols-4 gap-4 pb-4">
              {favPictures.map((fp) => (
                <div key={fp.id} className="relative group/pic aspect-square bg-slate-900 rounded-xl overflow-hidden border-2 border-[#B0B7BC] shadow-md hover:scale-[1.02] transition-transform">
                  <img src={proxyImg(fp.url)} alt={fp.caption || "Fav"} className="w-full h-full object-cover" />
                  {fp.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 px-2 py-1.5 font-mono text-[9px] text-white truncate font-bold uppercase tracking-tighter">
                      {fp.caption}
                    </div>
                  )}
                  <button onClick={() => setDeletePhotoConfirmId(fp.id)} className="absolute top-2 right-2 opacity-0 group-hover/pic:opacity-100 transition-opacity bg-black/70 hover:bg-red-500/80 text-white rounded-lg p-1.5 z-20 shadow-lg"><X className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { setLightboxPhotoId(fp.id); setLightboxOpen(true); }} className="absolute inset-0 w-full h-full opacity-0 hover:opacity-100 transition-opacity bg-black/30 flex items-center justify-center z-10"><span className="text-white text-[10px] font-black uppercase tracking-[0.2em] bg-black/50 px-3 py-1.5 rounded-lg backdrop-blur-md">Expand</span></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center border-2 border-dashed border-slate-700 rounded-2xl bg-slate-900/20">
              <ImageIcon className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-slate-600 font-bold">Empty Gallery</div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t border-slate-700">
            <Button variant="ghost" onClick={() => setFavOpen(false)} className="rounded-xl text-slate-400 hover:text-white">Close Gallery</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox for Gallery Photos */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="bg-black border-2 border-[#B0B7BC] rounded-2xl sm:max-w-4xl max-h-[90vh] p-0 overflow-hidden shadow-2xl">
          {lightboxPhotoId && (() => {
            const photo = favPictures.find((fp) => fp.id === lightboxPhotoId);
            if (!photo) return null;
            return (
              <div className="relative w-full h-full flex flex-col bg-black">
                <div className="flex-1 flex items-center justify-center p-4">
                  <img src={proxyImg(photo.url)} alt={photo.caption || "Photo"} className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl border border-white/10" />
                </div>
                {photo.caption && (
                  <div className="bg-slate-900/90 border-t border-slate-700 px-6 py-5 font-mono text-sm text-white font-bold uppercase tracking-wider text-center backdrop-blur-md">
                    {photo.caption}
                  </div>
                )}
                <button onClick={() => setLightboxOpen(false)} className="absolute top-4 right-4 bg-black/60 hover:bg-red-500/80 text-white rounded-xl p-3 backdrop-blur-md transition-all"><X className="w-6 h-6" /></button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialogs */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-slate-800 border-2 border-red-500/50 rounded-2xl shadow-[0_0_30px_rgba(239,68,68,0.1)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl font-black uppercase tracking-tight text-red-500">Destroy Profile?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 font-mono text-xs uppercase tracking-widest leading-relaxed">
              You are about to permanently erase @{profile.username} from the Social Rolodex. This includes all contact data, notes, and the photo gallery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="rounded-xl bg-slate-700 border-slate-600 hover:bg-slate-600 font-bold uppercase tracking-widest text-[11px]">Abort</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(profile.id)} className="rounded-xl bg-red-600 hover:bg-red-700 text-white border-0 font-display font-black uppercase tracking-[0.2em] px-8">Confirm Erase</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletePhotoConfirmId !== null} onOpenChange={(open) => !open && setDeletePhotoConfirmId(null)}>
        <AlertDialogContent className="bg-slate-800 border-2 border-red-500/50 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display uppercase tracking-tight text-red-500">Delete Photo?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 font-mono text-xs uppercase tracking-widest">Permanently remove this image from the gallery?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl bg-slate-700 border-slate-600">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deletePhotoConfirmId) deleteFavPic(deletePhotoConfirmId); setDeletePhotoConfirmId(null); }} className="rounded-xl bg-red-600 hover:bg-red-700 text-white border-0 font-bold uppercase tracking-widest">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Details Dialog */}
      <Dialog open={viewDetailsOpen} onOpenChange={setViewDetailsOpen}>
        <DialogContent className="bg-slate-800 border-2 border-[#B0B7BC] rounded-2xl sm:max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl">
          <DialogHeader className="border-b border-slate-700 pb-5">
            <DialogTitle className="font-display text-2xl font-black uppercase tracking-tight text-white flex items-center gap-4">
              <div className="w-16 h-16 rounded-full border-2 border-[#B0B7BC] overflow-hidden shrink-0 shadow-lg">
                <img src={proxyImg(profile.profile_pic_url)} className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="text-2xl">@{profile.username}</div>
                <div className="text-sm font-bold text-[#B0B7BC] normal-case opacity-80">{profile.full_name}</div>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-8 py-6">
            {profile.home_address && (
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#0076B6] block mb-3 font-black">Physical Address</label>
                <div className="bg-slate-900/60 border-2 border-slate-700 p-4 rounded-xl text-sm text-slate-300 whitespace-pre-wrap leading-relaxed border-l-4 border-l-[#B0B7BC] shadow-inner font-bold">
                  {profile.home_address}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {(profile.phones || []).length > 0 && (
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#0076B6] block mb-3 font-black">Phones</label>
                  <div className="space-y-2">
                    {profile.phones.map((p, i) => (
                      <div key={i} className="font-mono text-xs text-slate-300 flex items-center gap-3 bg-slate-900/40 p-2 rounded-lg border border-slate-700/50">
                        <Phone className="w-3.5 h-3.5 text-[#0076B6]" /> {p}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(profile.emails || []).length > 0 && (
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#0076B6] block mb-3 font-black">Emails</label>
                  <div className="space-y-2">
                    {profile.emails.map((e, i) => (
                      <div key={i} className="font-mono text-xs text-slate-300 flex items-center gap-3 bg-slate-900/40 p-2 rounded-lg border border-slate-700/50">
                        <Mail className="w-3.5 h-3.5 text-[#0076B6]" /> {e}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {Object.values(profile.socials || {}).some(v => v) && (
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#0076B6] block mb-3 font-black">Networks</label>
                <div className="grid grid-cols-2 gap-3">
                  {SOCIAL_META.map(meta => {
                    const val = (profile.socials || {})[meta.key];
                    if (!val) return null;
                    return (
                      <div key={meta.key} className="flex items-center gap-3 bg-slate-900/60 border border-slate-700 p-3 rounded-xl hover:border-[#B0B7BC] transition-colors shadow-sm">
                        <span className="text-xl">{meta.icon}</span>
                        <div className="min-w-0">
                          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold">{meta.label}</div>
                          <div className="text-xs text-slate-300 truncate font-bold">{val}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {profile.notes && (
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#0076B6] block mb-3 font-black">Intelligence / Notes</label>
                <div className="bg-slate-900/60 border-2 border-slate-700 p-5 rounded-xl text-sm text-slate-300 whitespace-pre-wrap leading-relaxed italic border-l-4 border-l-[#0076B6] shadow-inner">
                  &ldquo;{profile.notes}&rdquo;
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between items-center border-t border-slate-700 pt-5 mt-2">
            <div className="font-mono text-[9px] text-slate-500 uppercase tracking-[0.3em] font-bold">Logged {new Date(profile.created_at).toLocaleDateString()}</div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setViewDetailsOpen(false)} className="rounded-xl text-slate-400 hover:text-white font-bold uppercase tracking-widest text-[11px]">Close</Button>
              <Button onClick={() => { setViewDetailsOpen(false); setEditOpen(true); }} className="rounded-xl bg-[#0076B6] hover:bg-[#0089d3] font-display font-black uppercase tracking-[0.2em] px-8 shadow-lg">Edit</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-slate-800 border-2 border-[#B0B7BC] rounded-2xl sm:max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
          <DialogHeader className="border-b border-slate-700 pb-5">
            <DialogTitle className="font-display text-2xl font-black uppercase tracking-tight text-white">Modify Dossier</DialogTitle>
            <DialogDescription className="text-slate-400 font-mono text-[11px] uppercase tracking-[0.2em]">Updating intelligence for @{profile.username}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
            <div className="space-y-6">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-400 mb-2 block font-black">Full Legal Name</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Full Name"
                  className="bg-slate-900 border-slate-600 rounded-xl h-11 text-sm focus-visible:ring-[#0076B6] font-bold" />
              </div>
              
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-400 mb-2 block font-black">Primary Residence</label>
                <Textarea value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Street, City, State, ZIP"
                  className="bg-slate-900 border-slate-600 rounded-xl min-h-[100px] text-sm focus-visible:ring-[#0076B6] leading-relaxed font-bold" />
              </div>

              <ListEditor label="Alt Handles" items={editAltIgs} onChange={setEditAltIgs} placeholder="other_handle" icon={Instagram} />
              <ListEditor label="Phone Records" items={editPhones} onChange={setEditPhones} placeholder="555-0123" icon={Phone} />
              <ListEditor label="Email Records" items={editEmails} onChange={setEditEmails} placeholder="name@example.com" icon={Mail} />
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <label className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-400 block font-black">Connected Networks</label>
                <div className="grid grid-cols-1 gap-3">
                  {SOCIAL_META.map(meta => (
                    <div key={meta.key} className="flex items-center gap-3 bg-slate-900/40 p-2 rounded-xl border border-slate-700/50">
                      <span className="text-xl w-8 flex justify-center">{meta.icon}</span>
                      <Input 
                        value={editSocials[meta.key] || ""} 
                        onChange={(e) => setEditSocials({...editSocials, [meta.key]: e.target.value})}
                        placeholder={meta.placeholder}
                        className="bg-slate-900 border-slate-600 rounded-lg h-10 text-xs focus-visible:ring-[#0076B6] font-bold"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-400 mb-2 block font-black">Private Intelligence</label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Add internal intelligence here..."
                  className="bg-slate-900 border-slate-600 rounded-xl min-h-[120px] text-sm focus-visible:ring-[#0076B6] leading-relaxed italic font-bold" />
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-400 mb-2 block font-black">Mutual Followers (From Rolodex)</label>
                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto p-3 bg-slate-900 rounded-xl border border-slate-700">
                  {(categories.find(c => c.id === "__all")?.profiles || []).filter(p => p.id !== profile.id).map(p => (
                    <label key={p.id} className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer hover:bg-slate-800 p-1.5 rounded-lg transition-colors">
                      <input
                        type="checkbox"
                        checked={editFollowerIds.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) setEditFollowerIds([...editFollowerIds, p.id]);
                          else setEditFollowerIds(editFollowerIds.filter(id => id !== p.id));
                        }}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-[#0076B6] focus:ring-[#0076B6]"
                      />
                      <span className="truncate font-mono">@{p.username}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-700 pt-6">
            <Button variant="ghost" onClick={() => setEditOpen(false)} className="rounded-xl text-slate-400 hover:text-white font-bold uppercase tracking-widest text-[11px]">Discard</Button>
            <Button onClick={saveEdit} disabled={savingEdit} className="rounded-xl bg-[#0076B6] hover:bg-[#0089d3] font-display font-black uppercase tracking-[0.2em] px-10 shadow-xl h-12">
              {savingEdit ? "Updating..." : "Commit Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Picture Change Dialog */}
      <Dialog open={picOpen} onOpenChange={setPicOpen}>
        <DialogContent className="bg-slate-800 border-2 border-[#B0B7BC] rounded-2xl sm:max-w-md shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-black uppercase tracking-tight text-white">Update Profile Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-3">
              <label className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#0076B6] font-black">Direct URL</label>
              <div className="flex gap-3">
                <Input value={picUrl} onChange={(e) => setPicUrl(e.target.value)} placeholder="https://..."
                  className="bg-slate-900 border-slate-600 rounded-xl h-11 focus-visible:ring-[#0076B6]" />
                <Button onClick={setManualUrl} disabled={busy || !picUrl.trim()} size="sm" className="rounded-xl bg-[#0076B6] hover:bg-[#0089d3] px-6">Set</Button>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t-2 border-slate-700" /></div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-[0.4em] font-black"><span className="bg-slate-800 px-4 text-slate-500">OR</span></div>
            </div>
            <div className="space-y-3">
              <label className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#0076B6] font-black">Local Upload</label>
              <input type="file" ref={fileRef} onChange={uploadPic} className="hidden" accept="image/*" />
              <Button onClick={() => fileRef.current?.click()} disabled={uploading} variant="outline" className="w-full h-14 rounded-xl border-2 border-slate-600 border-dashed text-slate-300 hover:bg-slate-700 hover:border-[#B0B7BC] transition-all">
                {uploading ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <Upload className="w-5 h-5 mr-3 text-[#0076B6]" />}
                <span className="font-bold uppercase tracking-widest text-xs">{uploading ? "Processing..." : "Select File from Device"}</span>
              </Button>
            </div>
            {profile.profile_pic_url && (
              <Button onClick={removePic} disabled={removingPic} variant="ghost" className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-xl py-6 border border-red-900/30">
                {removingPic ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <Trash2 className="w-5 h-5 mr-3" />}
                <span className="font-black uppercase tracking-widest text-xs">Purge Image</span>
              </Button>
            )}
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t-2 border-slate-700" /></div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-[0.4em] font-black"><span className="bg-slate-800 px-4 text-slate-500">OR</span></div>
            </div>
            <Button onClick={() => { setPicOpen(false); setImportHtmlOpen(true); }} variant="outline" className="w-full h-14 rounded-xl border-2 border-slate-600 border-dashed text-slate-300 hover:bg-slate-700 hover:border-[#B0B7BC] transition-all">
              <LinkIcon className="w-5 h-5 mr-3 text-[#0076B6]" />
              <span className="font-bold uppercase tracking-widest text-xs">Import from Instagram HTML</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* HTML Import Dialog */}
      <Dialog open={importHtmlOpen} onOpenChange={setImportHtmlOpen}>
        <DialogContent className="bg-slate-800 border-2 border-[#B0B7BC] rounded-2xl sm:max-w-xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-black uppercase tracking-tight text-white">Paste Instagram HTML</DialogTitle>
            <DialogDescription className="text-slate-400 font-mono text-[10px] uppercase tracking-widest leading-relaxed">
              Right-click the profile page on Instagram, select "View Page Source", Copy everything (Ctrl+A, Ctrl+C), and Paste it below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea 
              value={pastedHtml} 
              onChange={(e) => setPastedHtml(e.target.value)} 
              placeholder="Paste raw HTML here..."
              className="bg-slate-900 border-slate-600 rounded-xl min-h-[300px] text-[10px] font-mono focus-visible:ring-[#0076B6]"
            />
            <Button onClick={importHtml} disabled={importingHtml || !pastedHtml.trim()} className="w-full h-12 rounded-xl bg-[#0076B6] hover:bg-[#0089d3] font-black uppercase tracking-widest">
              {importingHtml ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Process HTML & Update Profile"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
