import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Link2, Sparkles, Loader2, Download, Clipboard, FileJson, FileSpreadsheet,
  X, Plus, Pencil, Trash2, Filter, ExternalLink
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import {
  parseInstagramUrl, listUsers, addUser, updateUser, deleteUser,
  listCategories, exportUrl,
} from "@/lib/api";

const ALL = "__ALL__";

export default function RolodexPage() {
  const [url, setUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pendingCategories, setPendingCategories] = useState([]);
  const [newCatInput, setNewCatInput] = useState("");

  const [users, setUsers] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [activeFilter, setActiveFilter] = useState(ALL);
  const [pulseInput, setPulseInput] = useState(false);

  const [editing, setEditing] = useState(null);
  const [editPicUrl, setEditPicUrl] = useState("");
  const [editCats, setEditCats] = useState([]);
  const [editCatInput, setEditCatInput] = useState("");

  const refreshAll = useCallback(async () => {
    const [u, c] = await Promise.all([listUsers(), listCategories()]);
    setUsers(u);
    setAllCategories(c);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [u, c] = await Promise.all([listUsers(), listCategories()]);
        if (cancelled) return;
        setUsers(u);
        setAllCategories(c);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load list");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visibleUsers = useMemo(() => {
    if (activeFilter === ALL) return users;
    return users.filter((u) => (u.categories || []).includes(activeFilter));
  }, [users, activeFilter]);

  const handleParse = async () => {
    if (!url.trim()) { toast.error("Paste an Instagram link first"); return; }
    setParsing(true); setPulseInput(true);
    try {
      const data = await parseInstagramUrl(url.trim());
      setPreview(data); setPendingCategories([]);
      toast.success(`Found @${data.username}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not parse that link");
    } finally {
      setParsing(false);
      setTimeout(() => setPulseInput(false), 800);
    }
  };

  const handleSavePreview = async () => {
    if (!preview) return;
    try {
      await addUser({
        username: preview.username,
        profile_url: preview.profile_url,
        profile_pic_url: preview.profile_pic_url,
        categories: pendingCategories,
      });
      toast.success(`Added @${preview.username}`);
      setPreview(null); setUrl(""); setPendingCategories([]); setNewCatInput("");
      await refreshAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to add user");
    }
  };

  const addPendingCategory = (raw) => {
    const v = (raw || newCatInput).trim();
    if (!v) return;
    if (!pendingCategories.includes(v)) setPendingCategories([...pendingCategories, v]);
    setNewCatInput("");
  };
  const removePendingCategory = (c) =>
    setPendingCategories(pendingCategories.filter((x) => x !== c));

  const openEdit = (u) => {
    setEditing(u);
    setEditPicUrl(u.profile_pic_url || "");
    setEditCats([...(u.categories || [])]);
    setEditCatInput("");
  };
  const closeEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateUser(editing.id, { profile_pic_url: editPicUrl, categories: editCats });
      toast.success(`Updated @${editing.username}`);
      closeEdit(); await refreshAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to update");
    }
  };

  const removeUser = async (u) => {
    try {
      await deleteUser(u.id);
      toast.success(`Removed @${u.username}`);
      await refreshAll();
    } catch (e) { toast.error("Failed to remove"); }
  };

  const copyAllToClipboard = async () => {
    const text = users.map((u) => {
      const cats = (u.categories || []).join(", ") || "—";
      return `@${u.username} [${cats}] ${u.profile_url}`;
    }).join("\n");
    try {
      await navigator.clipboard.writeText(text || "(empty list)");
      toast.success("List copied to clipboard");
    } catch (e) { toast.error("Clipboard blocked by browser"); }
  };

  const onKeyDownUrl = (e) => { if (e.key === "Enter") handleParse(); };

  return (
    <div className="min-h-screen">
      <Header onCopy={copyAllToClipboard} />
      <main className="max-w-6xl mx-auto px-6 sm:px-10 pt-14 pb-32">
        <section className="max-w-3xl mx-auto text-center">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#0076B6] mb-4">
            Instagram Share-Sheet Rolodex
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.02] text-slate-900">
            Drop a profile link.<br />
            <span className="text-[#0076B6]">File it neatly.</span>
          </h1>
          <p className="mt-5 text-slate-600 text-base sm:text-lg max-w-xl mx-auto">
            Paste any Instagram share URL. We strip out the noise, keep the username and avatar, and slot it into the categories you choose.
          </p>

          <div className={`relative mt-10 ${pulseInput ? "pulse-once rounded-xl" : ""}`}>
            <Link2 className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={onKeyDownUrl}
              placeholder="https://www.instagram.com/username?utm_source=…"
              className="h-16 text-base sm:text-lg rounded-xl border-2 border-slate-200 focus-visible:border-[#0076B6] focus-visible:ring-0 shadow-sm pl-14 pr-36"
            />
            <Button
              onClick={handleParse}
              disabled={parsing}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-12 px-5 rounded-lg bg-[#0076B6] hover:bg-[#005C90] text-white font-semibold"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" />
                       : (<><Sparkles className="h-4 w-4 mr-2" />Extract</>)}
            </Button>
          </div>

          {preview && (
            <PreviewPanel
              preview={preview}
              pendingCategories={pendingCategories}
              newCatInput={newCatInput}
              setNewCatInput={setNewCatInput}
              addPendingCategory={addPendingCategory}
              removePendingCategory={removePendingCategory}
              existingCategories={allCategories}
              onSave={handleSavePreview}
              onCancel={() => { setPreview(null); setPendingCategories([]); setNewCatInput(""); }}
            />
          )}
        </section>

        <div className="silver-divider my-14" />

        <section className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Your collection</h2>
            <p className="text-sm text-slate-500 mt-1">
              {users.length} profiles · {allCategories.length} categories
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-slate-300">
                  <Download className="h-4 w-4 mr-2" />Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-widest">Download</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={exportUrl("csv")} download>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />CSV file
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={exportUrl("json")} download>
                    <FileJson className="h-4 w-4 mr-2" />JSON file
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={copyAllToClipboard} className="bg-[#0076B6] hover:bg-[#005C90] text-white">
              <Clipboard className="h-4 w-4 mr-2" />Copy list
            </Button>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-2 mb-8">
          <Filter className="h-4 w-4 text-slate-400 mr-1" />
          <button
            className={`chip-cat ${activeFilter === ALL ? "active" : ""}`}
            onClick={() => setActiveFilter(ALL)}
          >All · {users.length}</button>
          {allCategories.map((c) => {
            const count = users.filter((u) => (u.categories || []).includes(c)).length;
            return (
              <button key={c}
                className={`chip-cat ${activeFilter === c ? "active" : ""}`}
                onClick={() => setActiveFilter(c)}
              >{c} · {count}</button>
            );
          })}
        </section>

        {visibleUsers.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {visibleUsers.map((u, idx) => (
              <UserCard
                key={u.id}
                user={u}
                style={{ animationDelay: `${idx * 35}ms` }}
                onEdit={() => openEdit(u)}
                onRemove={() => removeUser(u)}
              />
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!editing} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bold tracking-tight">Edit @{editing?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                Profile picture URL
              </label>
              <Input
                value={editPicUrl}
                onChange={(e) => setEditPicUrl(e.target.value)}
                placeholder="https://…"
                className="mt-2"
              />
              {editPicUrl && (
                <img src={editPicUrl} alt="preview"
                  className="mt-3 h-16 w-16 rounded-full object-cover ring-2 ring-slate-100"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Categories</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {editCats.map((c) => (
                  <span key={c} className="chip-cat active inline-flex items-center gap-1">
                    {c}
                    <button onClick={() => setEditCats(editCats.filter((x) => x !== c))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <Input
                  value={editCatInput}
                  onChange={(e) => setEditCatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = editCatInput.trim();
                      if (v && !editCats.includes(v)) setEditCats([...editCats, v]);
                      setEditCatInput("");
                    }
                  }}
                  placeholder="Add category…"
                />
                <Button type="button" variant="outline" onClick={() => {
                  const v = editCatInput.trim();
                  if (v && !editCats.includes(v)) setEditCats([...editCats, v]);
                  setEditCatInput("");
                }}>Add</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>Cancel</Button>
            <Button onClick={saveEdit} className="bg-[#0076B6] hover:bg-[#005C90] text-white">
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Header({ onCopy }) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-slate-200/60">
      <div className="max-w-6xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-md bg-[#0076B6] grid place-items-center text-white font-extrabold tracking-tighter shadow-[2px_2px_0_#C0C0C0]">
            IG
          </div>
          <div>
            <div className="font-bold tracking-tight leading-none">Rolodex</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
              instagram curator
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onCopy} className="text-slate-600">
          <Clipboard className="h-4 w-4 mr-2" />Copy list
        </Button>
      </div>
    </header>
  );
}

function PreviewPanel({
  preview, pendingCategories, newCatInput, setNewCatInput,
  addPendingCategory, removePendingCategory, existingCategories, onSave, onCancel,
}) {
  return (
    <div className="mt-8 rolodex-card text-left p-6 sm:p-7 stagger-in">
      <div className="flex items-start gap-5">
        <img
          src={preview.profile_pic_url}
          alt={preview.username}
          className="h-16 w-16 rounded-full object-cover ring-2 ring-slate-100 shadow-sm flex-shrink-0"
          onError={(e) => {
            e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${preview.username}&backgroundColor=0076B6&textColor=ffffff`;
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#0076B6]">Extracted</div>
          <div className="text-2xl font-bold tracking-tight truncate">@{preview.username}</div>
          <a href={preview.profile_url} target="_blank" rel="noreferrer"
             className="text-sm text-slate-500 hover:text-[#0076B6] inline-flex items-center gap-1 mt-0.5 break-all">
            {preview.profile_url}<ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-700" aria-label="Cancel">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="silver-divider my-6" />

      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-2">
          Assign categories
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {pendingCategories.map((c) => (
            <span key={c} className="chip-cat active inline-flex items-center gap-1">
              {c}
              <button onClick={() => removePendingCategory(c)}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newCatInput}
            onChange={(e) => setNewCatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addPendingCategory(); }
            }}
            placeholder="e.g. friends, designers, food…"
          />
          <Button type="button" variant="outline" onClick={() => addPendingCategory()}>
            <Plus className="h-4 w-4 mr-1" />Add
          </Button>
        </div>
        {existingCategories.length > 0 && (
          <div className="mt-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-2">
              Quick reuse
            </div>
            <div className="flex flex-wrap gap-2">
              {existingCategories
                .filter((c) => !pendingCategories.includes(c))
                .map((c) => (
                  <button key={c} className="chip-cat" onClick={() => addPendingCategory(c)}>
                    + {c}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={onSave} className="bg-[#0076B6] hover:bg-[#005C90] text-white">
          Save to list
        </Button>
      </div>
    </div>
  );
}

function UserCard({ user, onEdit, onRemove, style }) {
  return (
    <div className="rolodex-card p-5 stagger-in" style={style}>
      <div className="flex items-start gap-4">
        <img
          src={user.profile_pic_url}
          alt={user.username}
          className="h-12 w-12 rounded-full object-cover ring-2 ring-slate-100 flex-shrink-0"
          onError={(e) => {
            e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${user.username}&backgroundColor=0076B6&textColor=ffffff`;
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold tracking-tight truncate">@{user.username}</div>
          <a href={user.profile_url} target="_blank" rel="noreferrer"
             className="text-xs text-slate-500 hover:text-[#0076B6] inline-flex items-center gap-1">
            open profile<ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex flex-col gap-1">
          <button onClick={onEdit}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800" aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={onRemove}
            className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="silver-divider my-4" />
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {(user.categories || []).length === 0 ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
            uncategorized
          </span>
        ) : (
          (user.categories || []).map((c) => (
            <span key={c} className="chip-cat">{c}</span>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl bg-white/40">
      <div className="h-14 w-14 rounded-full bg-[#0076B6]/10 mx-auto grid place-items-center mb-4">
        <Link2 className="h-6 w-6 text-[#0076B6]" />
      </div>
      <h3 className="text-xl font-bold tracking-tight">Nothing here yet</h3>
      <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
        Tap Share on any Instagram profile, copy the link, and paste it up top to start building your collection.
      </p>
    </div>
  );
}
