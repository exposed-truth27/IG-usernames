import { useRef, useState, useEffect } from "react";
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
  
  // Reset imgErr when profile_pic_url changes
  useEffect(() => {
    setImgErr(false);
  }, [profile.profile_pic_url]);

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
  const [resetting, setResetting] = useState(false);

  const [favOpen, setFavOpen] = useState(false);
  const [favUrl, setFavUrl] = useState("");
  const [favCaption, setFavCaption] = useState("");
  const [addingFav, setAddingFav] = useState(false);
  const favFileRef = useRef(null);
  const [uploadingFav, setUploadingFav] = useState(false);

  const [profilePicLightboxOpen, setProfilePicLightboxOpen] = useState(false);
  const [favPicLightboxOpen, setFavPicLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const refresh = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/profiles/${profile.id}/refresh`);
      onChange(res);
      toast.success("Refreshed!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Refresh failed");
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async () => {
    setSavingEdit(true);
    try {
      const res = await api.patch(`/profiles/${profile.id}`, {
        full_name: editName,
        home_address: editAddress,
        alt_instagrams: editAltIgs,
        phones: editPhones,
        emails: editEmails,
        socials: editSocials,
        notes: editNotes,
        mutual_follower_ids: editFollowerIds,
      });
      onChange(res);
      setEditOpen(false);
      toast.success("Updated!");
    } catch (e) {
      toast.error("Update failed");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleImportHtml = async () => {
    if (!pastedHtml.trim()) return;
    setImportingHtml(true);
    try {
      const res = await api.post(`/profiles/${profile.id}/import-html`, { html: pastedHtml });
      onChange(res);
      setImportHtmlOpen(false);
      setPastedHtml("");
      toast.success("Imported!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Import failed");
    } finally {
      setImportingHtml(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await api.post(`/profiles/${profile.id}/reset-fetched`);
      onChange(res);
      toast.success("Reset!");
    } catch (e) {
      toast.error("Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const onFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    try {
      const res = await api.post(`/profiles/${profile.id}/picture/upload`, fd);
      onChange(res);
      toast.success("Uploaded!");
    } catch (err) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const setManualUrl = async () => {
    if (!picUrl) return;
    setUploading(true);
    try {
      const res = await api.post(`/profiles/${profile.id}/picture/url`, { url: picUrl });
      onChange(res);
      setPicUrl("");
      setPicOpen(false);
      toast.success("URL set!");
    } catch (err) {
      toast.error("Invalid URL");
    } finally {
      setUploading(false);
    }
  };

  const removePic = async () => {
    setRemovingPic(true);
    try {
      const res = await api.delete(`/profiles/${profile.id}/picture`);
      onChange(res);
      toast.success("Picture removed!");
    } catch (err) {
      toast.error("Remove failed");
    } finally {
      setRemovingPic(false);
    }
  };

  const addFavUrl = async () => {
    if (!favUrl) return;
    setAddingFav(true);
    try {
      const res = await api.post(`/profiles/${profile.id}/fav-pictures/url`, { url: favUrl, caption: favCaption });
      onChange(res);
      setFavUrl("");
      setFavCaption("");
      setFavOpen(false);
      toast.success("Added!");
    } catch (err) {
      toast.error("Add failed");
    } finally {
      setAddingFav(false);
    }
  };

  const onFavFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    if (favCaption) fd.append("caption", favCaption);
    setUploadingFav(true);
    try {
      const res = await api.post(`/profiles/${profile.id}/fav-pictures/upload`, fd);
      onChange(res);
      setFavCaption("");
      setFavOpen(false);
      toast.success("Uploaded!");
    } catch (err) {
      toast.error("Upload failed");
    } finally {
      setUploadingFav(false);
    }
  };

  const deleteFav = async (picId) => {
    try {
      const res = await api.delete(`/profiles/${profile.id}/fav-pictures/${picId}`);
      onChange(res);
      toast.success("Deleted!");
    } catch (err) {
      toast.error("Delete failed");
    }
  };

  const initials = (profile.full_name || profile.username || "?")
    .split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const isFavorite = profile.category_ids.includes("__sys_favorite");
  const isActive = profile.category_ids.includes("__sys_active");
  const isComplete = profile.category_ids.includes("__sys_complete");

  const toggleCat = async (cid) => {
    const current = profile.category_ids || [];
    let next;
    if (current.includes(cid)) {
      next = current.filter(id => id !== cid);
    } else {
      next = [...current, cid];
    }
    try {
      const res = await api.patch(`/profiles/${profile.id}`, { category_ids: next });
      onChange(res);
    } catch (e) {
      toast.error("Failed to update category");
    }
  };

  return (
    <div className="group relative bg-slate-900/40 backdrop-blur-sm border border-slate-800 rounded-3xl p-6 transition-all duration-500 hover:shadow-[0_0_40px_-10px_rgba(0,118,182,0.3)] hover:border-[#0076B6]/50">
      <div className="flex items-start gap-6">
        {/* Avatar Section */}
        <div className="relative shrink-0">
          <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full p-1 bg-gradient-to-br from-[#0076B6] via-[#0089d3] to-slate-800 shadow-2xl overflow-hidden">
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
              ) }
              {profile.has_new_post && (
                <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-slate-900 shadow-xl" title="New Post" />
              )}
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="flex-1 min-w-0 pt-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl md:text-2xl font-display font-black text-white tracking-tight truncate max-w-[200px] md:max-w-[300px]">
                  {profile.full_name || profile.username}
                </h3>
                {profile.is_verified && <BadgeCheck className="w-5 h-5 text-[#0076B6] fill-[#0076B6]/20 shrink-0" />}
                {isFavorite && <Star className="w-5 h-5 text-yellow-500 fill-yellow-500 shrink-0" />}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <a
                  href={`https://instagram.com/${profile.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-[#0076B6] hover:text-[#0089d3] transition-colors flex items-center gap-1 font-bold"
                >
                  @{profile.username}
                  <ExternalLink className="w-3 h-3" />
                </a>
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
                  ID: {profile.id.slice(0, 8)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <Button
                variant="ghost"
                size="icon"
                onClick={refresh}
                disabled={busy}
                className="w-9 h-9 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                title="Refresh from Instagram"
              >
                <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin text-[#0076B6]" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditOpen(true)}
                className="w-9 h-9 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                title="Edit Profile"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-9 h-9 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                  >
                    <Tag className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-slate-900 border-slate-800 rounded-2xl shadow-2xl p-2">
                  <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-widest text-slate-500 px-2 py-1.5">
                    Categories
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-slate-800" />
                  {categories.map((cat) => (
                    <DropdownMenuCheckboxItem
                      key={cat.id}
                      checked={profile.category_ids.includes(cat.id)}
                      onCheckedChange={() => toggleCat(cat.id)}
                      className="rounded-xl focus:bg-[#0076B6]/20 focus:text-[#0076B6] transition-colors"
                    >
                      {cat.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-9 h-9 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Delete Profile"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-slate-900 border-slate-800 rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white font-display text-xl font-black">Delete Profile?</AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-400 font-mono text-sm">
                      This will permanently remove @{profile.username} and all associated data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300 rounded-xl hover:bg-slate-700 hover:text-white">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDelete}
                      className="bg-red-600 hover:bg-red-700 text-white rounded-xl border-none font-display font-bold uppercase tracking-widest text-xs"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Bio */}
          {profile.bio && (
            <p className="mt-3 text-sm text-slate-300 font-mono leading-relaxed line-clamp-2 italic border-l-2 border-[#0076B6]/30 pl-3">
              {profile.bio}
            </p>
          )}

          {/* Info Tags */}
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.home_address && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700 text-[11px] font-mono text-slate-300">
                📍 {profile.home_address}
              </span>
            )}
            {profile.phones.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700 text-[11px] font-mono text-slate-300">
                📞 {p}
              </span>
            ))}
            {profile.emails.map((e, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700 text-[11px] font-mono text-slate-300">
                ✉️ {e}
              </span>
            ))}
            {Object.entries(profile.socials).map(([k, v]) => v && (
              <span key={k} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700 text-[11px] font-mono text-slate-300 uppercase tracking-widest">
                {SOCIAL_META.find(m => m.key === k)?.icon || "🔗"} {v}
              </span>
            ))}
          </div>

          {/* Mutual Followers */}
          {profile.follower_images && profile.follower_images.length > 0 && (
            <div className="mt-5 flex items-center gap-3">
              <div className="flex -space-x-3 overflow-hidden p-1">
                {profile.follower_images.slice(0, 5).map((url, i) => (
                  <div key={i} className="relative w-9 h-9 rounded-full border-2 border-slate-900 overflow-hidden ring-2 ring-[#0076B6]/20 transition-transform hover:scale-110 hover:z-10 shadow-lg">
                    <img src={proxyImg(url)} alt="Follower" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">
                {profile.follower_images.length > 5 ? `+${profile.follower_images.length - 5} Mutuals` : "Mutuals"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Profile Picture Lightbox */}
      <Dialog open={profilePicLightboxOpen} onOpenChange={setProfilePicLightboxOpen}>
        <DialogContent className="max-w-[95vw] md:max-w-3xl bg-slate-950/90 border-slate-800 p-0 overflow-hidden rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.8)]">
          <div className="relative aspect-square w-full group/lightbox">
            {profile.profile_pic_url ? (
              <img
                src={proxyImg(profile.profile_pic_url)}
                alt={profile.username}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-700 text-9xl font-display font-black">
                {initials}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
              <h2 className="text-white text-3xl font-display font-black tracking-tight">
                {profile.full_name || profile.username}
              </h2>
              <p className="text-[#0076B6] font-mono text-sm font-bold">@{profile.username}</p>
            </div>
            <button
              onClick={() => setProfilePicLightboxOpen(false)}
              className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-white flex items-center justify-center hover:bg-black/60 transition-all z-50"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 rounded-3xl max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-black text-white flex items-center gap-3">
              <Edit2 className="w-6 h-6 text-[#0076B6]" />
              Edit Profile
            </DialogTitle>
            <DialogDescription className="text-slate-400 font-mono text-sm">
              Update information for @{profile.username}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-8 py-6">
            {/* Appearance Section */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#0076B6] font-black border-b border-slate-800 pb-2">Appearance</h4>
              <div className="flex items-center gap-6">
                <div className="relative group/edit-avatar">
                  <div className="w-24 h-24 rounded-full border-2 border-slate-700 overflow-hidden bg-slate-800 shadow-xl">
                    {profile.profile_pic_url && !imgErr ? (
                      <img src={proxyImg(profile.profile_pic_url)} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-2xl font-display font-black">
                        {initials}
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover/edit-avatar:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button onClick={() => fileRef.current?.click()} className="p-2 text-white hover:text-[#0076B6]" title="Upload">
                      <Upload className="w-5 h-5" />
                    </button>
                    <button onClick={() => setPicOpen(true)} className="p-2 text-white hover:text-[#0076B6]" title="URL">
                      <LinkIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 block">Full Name</label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Display Name"
                      className="bg-slate-950 border-slate-700 rounded-xl h-10 focus-visible:ring-[#0076B6] font-display text-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={refresh} disabled={busy}
                      className="flex-1 border-slate-700 hover:bg-slate-800 rounded-xl font-mono text-[10px] uppercase tracking-widest">
                      <RefreshCw className={`w-3 h-3 mr-2 ${busy ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setImportHtmlOpen(true)}
                      className="flex-1 border-slate-700 hover:bg-slate-800 rounded-xl font-mono text-[10px] uppercase tracking-widest">
                      <LinkIcon className="w-3 h-3 mr-2" /> Paste HTML
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleReset} disabled={resetting}
                      className="border-slate-700 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50 rounded-xl font-mono text-[10px] uppercase tracking-widest">
                      <RefreshCw className={`w-3 h-3 ${resetting ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Section */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#0076B6] font-black border-b border-slate-800 pb-2">Contact & Location</h4>
              <div className="grid gap-4">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 block inline-flex items-center gap-1.5">
                    📍 Home Address
                  </label>
                  <Input
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="Physical address or city"
                    className="bg-slate-950 border-slate-700 rounded-xl h-10 focus-visible:ring-[#0076B6] font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ListEditor label="Phone Numbers" icon={Phone} items={editPhones} placeholder="+1..." onChange={setEditPhones} />
                  <ListEditor label="Email Addresses" icon={Mail} items={editEmails} placeholder="email@example.com" onChange={setEditEmails} />
                </div>
              </div>
            </div>

            {/* Socials Section */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#0076B6] font-black border-b border-slate-800 pb-2">Social Media</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {SOCIAL_META.map((m) => (
                  <div key={m.key}>
                    <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 block flex items-center gap-1.5">
                      <span className="text-xs">{m.icon}</span> {m.label}
                    </label>
                    <Input
                      value={editSocials[m.key] || ""}
                      onChange={(e) => setEditSocials({ ...editSocials, [m.key]: e.target.value })}
                      placeholder={m.placeholder}
                      className="bg-slate-950 border-slate-700 rounded-xl h-9 text-sm focus-visible:ring-[#0076B6] font-mono"
                    />
                  </div>
                ))}
                <div>
                  <ListEditor label="Alt Instagrams" icon={Instagram} items={editAltIgs} placeholder="username" onChange={setEditAltIgs} />
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#0076B6] font-black border-b border-slate-800 pb-2">Notes</h4>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Additional notes about this person..."
                className="bg-slate-950 border-slate-700 rounded-2xl min-h-[100px] focus-visible:ring-[#0076B6] font-mono text-sm custom-scrollbar"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-slate-800 pt-6">
            <Button variant="ghost" onClick={() => setEditOpen(false)} className="rounded-xl text-slate-400 hover:text-white font-mono uppercase tracking-widest text-[10px]">Cancel</Button>
            <Button onClick={handleEdit} disabled={savingEdit} className="bg-[#0076B6] hover:bg-[#0089d3] text-white rounded-xl px-8 font-display font-black uppercase tracking-[0.2em] text-xs">
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Pic Upload/URL Dialogs */}
      <input type="file" ref={fileRef} className="hidden" onChange={onFileChange} accept="image/*" />
      <Dialog open={picOpen} onOpenChange={setPicOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 rounded-3xl max-w-md shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-display font-black text-white">Update Profile Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-3">
              <label className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#0076B6] font-black">Direct URL</label>
              <div className="flex gap-3">
                <Input value={picUrl} onChange={(e) => setPicUrl(e.target.value)} placeholder="https://..."
                  className="bg-slate-950 border-slate-700 rounded-xl h-11 focus-visible:ring-[#0076B6]" />
                <Button onClick={setManualUrl} disabled={uploading || !picUrl.trim()} size="sm" className="rounded-xl bg-[#0076B6] hover:bg-[#0089d3] px-6 font-bold">Set</Button>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t-2 border-slate-800" /></div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-[0.4em] font-black"><span className="bg-slate-900 px-4 text-slate-500">OR</span></div>
            </div>
            <div className="space-y-3">
              <label className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#0076B6] font-black">Local Upload</label>
              <Button onClick={() => fileRef.current?.click()} disabled={uploading} variant="outline" className="w-full h-14 rounded-xl border-2 border-slate-700 border-dashed text-slate-300 hover:bg-slate-800 hover:border-[#0076B6] transition-all">
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
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t-2 border-slate-800" /></div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-[0.4em] font-black"><span className="bg-slate-900 px-4 text-slate-500">OR</span></div>
            </div>
            <Button onClick={() => { setPicOpen(false); setImportHtmlOpen(true); }} variant="outline" className="w-full h-14 rounded-xl border-2 border-slate-700 border-dashed text-slate-300 hover:bg-slate-800 hover:border-[#0076B6] transition-all">
              <LinkIcon className="w-5 h-5 mr-3 text-[#0076B6]" />
              <span className="font-bold uppercase tracking-widest text-xs">Import from Instagram HTML</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import HTML Dialog */}
      <Dialog open={importHtmlOpen} onOpenChange={setImportHtmlOpen}>
        <DialogContent className="max-w-3xl bg-slate-900 border-slate-800 rounded-3xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-black text-white flex items-center gap-3">
              <LinkIcon className="w-6 h-6 text-[#0076B6]" />
              Import from Instagram HTML
            </DialogTitle>
            <DialogDescription className="text-slate-400 font-mono text-sm leading-relaxed">
              If automatic refresh is blocked, go to the profile on Instagram, right-click &gt; <strong className="text-white">View Page Source</strong>, copy everything (Ctrl+A, Ctrl+C), and paste it here.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <Textarea
              value={pastedHtml}
              onChange={(e) => setPastedHtml(e.target.value)}
              placeholder="Paste HTML source here..."
              className="bg-slate-950 border-slate-700 rounded-2xl min-h-[300px] focus-visible:ring-[#0076B6] font-mono text-[10px] custom-scrollbar"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportHtmlOpen(false)} className="rounded-xl text-slate-400 hover:text-white font-mono uppercase tracking-widest text-[10px]">Cancel</Button>
            <Button onClick={handleImportHtml} disabled={importingHtml || !pastedHtml.trim()} className="bg-[#0076B6] hover:bg-[#0089d3] text-white rounded-xl px-8 font-display font-black uppercase tracking-[0.2em] text-xs">
              {importingHtml ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
