import { useState } from "react";
import { BadgeCheck, ExternalLink, RefreshCw, Trash2, Tag } from "lucide-react";
import { proxyImg, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export default function ProfileCard({ profile, categories, onChange, onDelete }) {
  const [imgErr, setImgErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const initials = (profile.username || "?").slice(0, 2).toUpperCase();
  const igUrl = `https://instagram.com/${profile.username}`;

  const toggleCategory = async (catId, checked) => {
    const next = checked
      ? [...new Set([...(profile.category_ids || []), catId])]
      : (profile.category_ids || []).filter((c) => c !== catId);
    try { await api.patch(`/profiles/${profile.id}`, { category_ids: next }); onChange({ ...profile, category_ids: next }); }
    catch { toast.error("Couldn't update categories"); }
  };

  const refresh = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/profiles/${profile.id}/refresh`); onChange({ ...profile, ...data }); toast.success("Refreshed from Instagram"); }
    catch { toast.error("Refresh failed"); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    try { await api.delete(`/profiles/${profile.id}`); onDelete(profile.id); }
    catch { toast.error("Delete failed"); }
  };

  const catChips = (profile.category_ids || []).map((id) => categories.find((c) => c.id === id)).filter(Boolean);

  return (
    <div data-testid={`profile-card-${profile.username}`} className="group relative bg-slate-800 border border-slate-700 rounded-sm p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[#0076B6] hover:shadow-[0_8px_32px_-8px_rgba(0,118,182,0.5)]">
      <div className="absolute top-0 left-0 right-0 h-[3px] honolulu-stripe rounded-t-sm opacity-60 group-hover:opacity-100 transition-opacity" />
      <div className="flex items-start justify-between mb-4">
        <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-slate-500">#{(profile.id || "").slice(0, 6)}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button data-testid={`refresh-${profile.username}`} onClick={refresh} disabled={busy} className="p-1.5 text-slate-400 hover:text-[#0076B6] hover:bg-slate-700/60 rounded-sm" title="Refresh from Instagram">
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
          </button>
          <button data-testid={`delete-${profile.username}`} onClick={remove} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700/60 rounded-sm" title="Remove">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#B0B7BC]/40 bg-slate-900 flex items-center justify-center">
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
        </div>
        <a href={igUrl} target="_blank" rel="noopener noreferrer" data-testid={`open-${profile.username}`} className="mt-4 font-display font-bold text-lg text-white tracking-tight hover:text-[#0076B6] inline-flex items-center gap-1.5">
          @{profile.username} <ExternalLink className="w-3.5 h-3.5 opacity-60" />
        </a>
        {profile.full_name && <div className="mt-1 text-sm text-slate-400 line-clamp-1">{profile.full_name}</div>}
        {profile.bio && <div className="mt-2 text-xs text-slate-500 line-clamp-2 leading-relaxed">{profile.bio}</div>}
      </div>
      <div className="mt-5 pt-4 border-t border-slate-700/70">
        <div className="flex flex-wrap items-center gap-1.5 justify-center min-h-[28px]">
          {catChips.map((c) => (
            <span key={c.id} className="font-mono text-[10px] uppercase tracking-wider bg-[#0076B6]/15 border border-[#0076B6]/40 text-[#7cc6e8] px-2 py-0.5 rounded-sm">{c.name}</span>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-testid={`tag-${profile.username}`} className="font-mono text-[10px] uppercase tracking-wider border border-dashed border-slate-600 text-slate-400 px-2 py-0.5 rounded-sm hover:border-[#B0B7BC] hover:text-[#B0B7BC] inline-flex items-center gap-1">
                <Tag className="w-3 h-3" /> Tag
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 rounded-sm">
              <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Assign Categories</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-700" />
              {categories.length === 0 && <DropdownMenuItem disabled className="text-xs text-slate-500">No categories yet</DropdownMenuItem>}
              {categories.map((c) => {
                const checked = (profile.category_ids || []).includes(c.id);
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
    </div>
  );
}
