import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import ProfileCard from "@/components/ProfileCard";
import BulkImportDialog from "@/components/BulkImportDialog";
import CopyDialog from "@/components/CopyDialog";
import { Copy, Download, LogOut, Plus, Search, ShieldCheck, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [pasteValue, setPasteValue] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catDialogOpen, setCatDialogOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, c] = await Promise.all([api.get("/profiles"), api.get("/categories")]);
        setProfiles(p.data);
        setCategories(c.data);
      } catch (e) { toast.error("Failed to load data"); }
    })();
  }, []);

  const extract = async (e) => {
    e?.preventDefault?.();
    if (!pasteValue.trim()) return;
    setExtracting(true);
    try {
      const target = activeCat !== "all" ? [activeCat] : [];
      const { data } = await api.post("/profiles", { url_or_username: pasteValue, category_ids: target });
      setProfiles((prev) => {
        const existing = prev.find((p) => p.id === data.id);
        if (existing) return prev.map((p) => (p.id === data.id ? data : p));
        return [data, ...prev];
      });
      setPasteValue("");
      toast.success(data.duplicate ? `@${data.username} already in rolodex` : `Added @${data.username}`);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
    finally { setExtracting(false); }
  };

  const createCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    try {
      const { data } = await api.post("/categories", { name });
      if (!categories.find((c) => c.id === data.id)) setCategories((prev) => [...prev, data]);
      setNewCatName(""); setCatDialogOpen(false);
      toast.success(`Created "${name}"`);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const deleteCategory = async (id) => {
    try {
      await api.delete(`/categories/${id}`);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setProfiles((prev) => prev.map((p) => ({ ...p, category_ids: (p.category_ids || []).filter((cid) => cid !== id) })));
      if (activeCat === id) setActiveCat("all");
      toast.success("Category removed");
    } catch { toast.error("Delete failed"); }
  };

  const filtered = useMemo(() => {
    let list = profiles;
    if (activeCat !== "all") list = list.filter((p) => (p.category_ids || []).includes(activeCat));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.username.toLowerCase().includes(q) || (p.full_name || "").toLowerCase().includes(q));
    }
    return list;
  }, [profiles, activeCat, search]);

  const exportJson = () => {
    const data = {
      exported_at: new Date().toISOString(),
      categories,
      profiles: profiles.map((p) => ({
        username: p.username, full_name: p.full_name, is_verified: p.is_verified,
        categories: (p.category_ids || []).map((id) => categories.find((c) => c.id === id)?.name).filter(Boolean),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rolodex-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const reloadAll = async () => {
    try {
      const [p, c] = await Promise.all([api.get("/profiles"), api.get("/categories")]);
      setProfiles(p.data); setCategories(c.data);
    } catch { toast.error("Reload failed"); }
  };

  return (
    <div className="min-h-screen bg-slate-900 bg-field-grid">
      <div className="absolute inset-0 bg-noise pointer-events-none" />
      <header className="relative border-b border-slate-700 bg-slate-900/80 backdrop-blur">
        <div className="h-1 honolulu-stripe" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#0076B6] flex items-center justify-center rounded-sm">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-display text-xl font-black uppercase tracking-tight text-white leading-none">
                Social <span className="text-[#0076B6]">Rolodex</span>
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-slate-500 mt-1">Detroit · Playbook v2</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.25em] text-[#B0B7BC]" data-testid="header-user-email">{user?.email}</span>
            <Button data-testid="logout-button" onClick={logout} variant="ghost" className="h-9 rounded-sm text-slate-400 hover:text-white hover:bg-slate-800">
              <LogOut className="w-4 h-4 mr-1.5" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
        <div className="mb-10">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#0076B6] mb-3">Instagram Share-Sheet Rolodex</div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black uppercase tracking-tighter text-white leading-[0.92]" data-testid="dashboard-title">
            Drop a profile link.<br /><span className="text-[#0076B6]">File it neatly.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-400">
            Paste any Instagram share URL or username. We strip out the noise, pull the avatar via RapidAPI, and slot it into the categories you choose.
          </p>
        </div>

        <form onSubmit={extract} className="border border-slate-700 bg-slate-800/60 rounded-sm p-5 md:p-6 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B0B7BC]">01 · Extract</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <Input data-testid="paste-url-input" value={pasteValue} onChange={(e) => setPasteValue(e.target.value)}
              placeholder="https://instagram.com/handle  or  @handle"
              className="bg-slate-900 border-slate-600 rounded-sm h-12 text-base focus-visible:ring-[#0076B6] font-mono" />
            <Button type="submit" disabled={extracting || !pasteValue.trim()} data-testid="extract-button"
              className="h-12 px-8 rounded-sm bg-[#0076B6] hover:bg-[#0089d3] text-white font-display uppercase tracking-widest text-base font-bold">
              {extracting ? "Fetching…" : "Extract"}
            </Button>
          </div>
        </form>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B0B7BC] mb-1">02 · Your Collection</div>
            <div className="font-display text-2xl font-bold uppercase tracking-tight text-white" data-testid="collection-count">
              {profiles.length} profile{profiles.length === 1 ? "" : "s"} · {categories.length} categor{categories.length === 1 ? "y" : "ies"}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <BulkImportDialog onImported={reloadAll} trigger={
              <Button data-testid="import-button" variant="outline" className="h-9 rounded-sm border-[#0076B6]/60 bg-[#0076B6]/10 text-[#7cc6e8] hover:bg-[#0076B6]/20 hover:text-white">
                <Upload className="w-4 h-4 mr-1.5" /> Import
              </Button>} />
            <Button data-testid="export-button" onClick={exportJson} variant="outline" className="h-9 rounded-sm border-slate-600 bg-transparent text-[#B0B7BC] hover:bg-slate-800 hover:text-white">
              <Download className="w-4 h-4 mr-1.5" /> Export
            </Button>
            <CopyDialog profiles={filtered} categories={categories} trigger={
              <Button data-testid="copy-button" variant="outline" className="h-9 rounded-sm border-slate-600 bg-transparent text-[#B0B7BC] hover:bg-slate-800 hover:text-white">
                <Copy className="w-4 h-4 mr-1.5" /> Copy…
              </Button>} />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6 border-b border-slate-700 pb-3">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <CatTab active={activeCat === "all"} onClick={() => setActiveCat("all")} label="All" count={profiles.length} testid="cat-tab-all" />
            {categories.map((c) => {
              const count = profiles.filter((p) => (p.category_ids || []).includes(c.id)).length;
              return <CatTab key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} label={c.name} count={count} testid={`cat-tab-${c.name}`} onDelete={() => deleteCategory(c.id)} />;
            })}
            <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
              <DialogTrigger asChild>
                <button data-testid="new-category-button" className="font-mono text-[10px] uppercase tracking-wider text-slate-400 px-3 py-1.5 rounded-sm border border-dashed border-slate-600 hover:border-[#0076B6] hover:text-[#0076B6] inline-flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Category
                </button>
              </DialogTrigger>
              <DialogContent className="bg-slate-800 border-slate-700 rounded-sm">
                <DialogHeader><DialogTitle className="font-display uppercase tracking-tight">New Category</DialogTitle></DialogHeader>
                <Input data-testid="new-category-input" value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createCategory()} placeholder="e.g. Wide Receivers"
                  className="bg-slate-900 border-slate-600 rounded-sm h-11 focus-visible:ring-[#0076B6]" />
                <DialogFooter>
                  <Button data-testid="create-category-button" onClick={createCategory} className="rounded-sm bg-[#0076B6] hover:bg-[#0089d3] font-display uppercase tracking-widest">Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="relative lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input data-testid="search-input" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search handles…" className="pl-9 bg-slate-900 border-slate-600 rounded-sm h-9 focus-visible:ring-[#0076B6] font-mono text-sm" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div data-testid="empty-state" className="border border-dashed border-slate-700 rounded-sm py-20 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B0B7BC] mb-3">Empty Roster</div>
            <div className="font-display text-2xl font-bold uppercase tracking-tight text-white">Nothing here yet</div>
            <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto">Tap Share on any Instagram profile, copy the link, and paste it up top to start building your collection.</p>
          </div>
        ) : (
          <div data-testid="profile-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((p) => (
              <ProfileCard key={p.id} profile={p} categories={categories}
                onChange={(np) => setProfiles((prev) => prev.map((x) => (x.id === np.id ? np : x)))}
                onDelete={(id) => setProfiles((prev) => prev.filter((x) => x.id !== id))} />
            ))}
          </div>
        )}
      </main>

      <footer className="relative border-t border-slate-700 mt-16 py-6 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">Honolulu Blue #0076B6 · Silver #B0B7BC · Slate Gray</div>
      </footer>
    </div>
  );
}

function CatTab({ active, onClick, label, count, testid, onDelete }) {
  return (
    <div className={`group inline-flex items-center font-display uppercase tracking-wider text-sm font-bold rounded-sm border transition-colors ${active ? "bg-[#0076B6] border-[#0076B6] text-white" : "bg-transparent border-slate-700 text-slate-400 hover:border-[#B0B7BC] hover:text-white"}`}>
      <button data-testid={testid} onClick={onClick} className="px-3 py-1.5 inline-flex items-center gap-2">
        <span>{label}</span>
        <span className={`font-mono text-[10px] ${active ? "text-white/80" : "text-slate-500"}`}>{count}</span>
      </button>
      {onDelete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button data-testid={`delete-cat-${label}`} className="px-2 py-1.5 border-l border-slate-700/60 opacity-0 group-hover:opacity-100 hover:text-red-400" title="Delete category">
              <Trash2 className="w-3 h-3" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-slate-800 border-slate-700 rounded-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display uppercase tracking-tight">Delete &ldquo;{label}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">This removes the category and unassigns it from all profiles. Profiles themselves are kept.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-sm bg-slate-700 border-slate-600 hover:bg-slate-600">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} className="rounded-sm bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
