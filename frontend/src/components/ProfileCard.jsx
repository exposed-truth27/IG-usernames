import { useRef, useState } from "react";
import {
  BadgeCheck, ExternalLink, RefreshCw, Trash2, Tag, Image as ImageIcon,
  Upload, Link as LinkIcon, Loader2, Star, ImageOff,
} from "lucide-react";
import { proxyImg, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const SYS_FAV = "__sys_favorite";
const SYS_ACTIVE = "__sys_active";
const SYS_COMPLETE = "__sys_complete";

export default function ProfileCard({ profile, categories, onChange, onDelete }) {
  const [imgErr, setImgErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picOpen, setPicOpen] = useState(false);
  const [picUrl, setPicUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removingPic, setRemovingPic] = useState(false);
  const fileRef = useRef(null);

  const initials = (profile.username || "?").slice(0, 2).toUpperCase();
  const igUrl = `https://instagram.com/${profile.username}`;
  const isManual = profile.pic_source === "manual";

  const catIds = profile.category_ids || [];
  const isFav = catIds.includes(SYS_FAV);
  const isActive = catIds.includes(SYS_ACTIVE);
  const isComplete = catIds.includes(SYS_COMPLETE);

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
          <button data-testid={`set-pic-${profile.username}`} onClick={() => setPicOpen(true)} className="p-1.5 text-slate-400 hover:text-[#0076B6] hover:bg-slate-700/60 rounded-sm" title="Set picture manually">
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
              title={statusPill.label}
            >
              {statusPill.label}
            </div>
          )}
        </div>

        <a href={igUrl} target="_blank" rel="noopener noreferrer" data-testid={`open-${profile.username}`} className="mt-4 font-display font-bold text-lg text-white tracking-tight hover:text-[#0076B6] inline-flex items-center gap-1.5">
          @{profile.username} <ExternalLink className="w-3.5 h-3.5 opacity-60" />
        </a>
        {profile.full_name && <div className="mt-1 text-sm text-slate-400 line-clamp-1">{profile.full_name}</div>}
        {profile.bio && <div className="mt-2 text-xs text-slate-500 line-clamp-2 leading-relaxed">{profile.bio}</div>}
      </div>

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
              {categories.length === 0 && <DropdownMenuItem disabled className="text-xs text-slate-500">No categories yet</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

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
                className="mt-2 block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-sm file:border-0 file:bg-[#0076B6] file:text-white file:font-display file:uppercase file:tracking-wider file:text-xs file:cursor-pointer hover:file:bg-[#0089d3] disabled:opacity-50"
              />
              <p className="mt-2 font-mono text-[10px] text-slate-500">JPG, PNG, WEBP, GIF · max 5 MB</p>
            </div>

            {isManual && (
              <div className="border-t border-slate-700 pt-4">
                <Button
                  variant="outline"
                  onClick={() => { setPicOpen(false); removePicture(); }}
                  disabled={removingPic}
                  data-testid={`remove-pic-dialog-${profile.username}`}
                  className="w-full rounded-sm border-red-700/50 bg-red-900/20 text-red-300 hover:bg-red-900/40 hover:text-red-200"
                >
                  <ImageOff className="w-4 h-4 mr-2" /> Remove manual picture
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setPicOpen(false)} className="rounded-sm border-slate-600 bg-transparent text-slate-300 hover:bg-slate-700">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
