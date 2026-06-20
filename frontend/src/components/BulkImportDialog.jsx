import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileJson, ListPlus } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function BulkImportDialog({ onImported, trigger }) {
  const [open, setOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const fileRef = useRef(null);

  const runBulk = async (items) => {
    if (items.length === 0) { toast.error("No usernames to import"); return; }
    setBusy(true);
    setProgress({ added: 0, merged: 0, error: 0, total: items.length });
    try {
      const { data } = await api.post("/profiles/bulk", { items });
      const summary = data.results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
      setProgress({ added: summary.added || 0, merged: summary.merged || 0, error: summary.error || 0, total: data.count });
      toast.success(`Imported ${summary.added || 0} new · ${summary.merged || 0} merged · ${summary.error || 0} errors`);
      onImported?.();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const handlePaste = async () => {
    const lines = pasteText.split("\n").map((l) => l.trim()).filter(Boolean);
    await runBulk(lines.map((l) => ({ url_or_username: l, category_names: [] })));
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.profiles || [];
      const items = list.map((p) => ({
        url_or_username: p.username || p.profile_url || p.url || "",
        category_names: p.categories || p.category_names || [],
      })).filter((p) => p.url_or_username);
      if (items.length === 0) { toast.error("No profiles found in JSON"); return; }
      await runBulk(items);
    } catch { toast.error("Invalid JSON file"); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent data-testid="bulk-import-dialog" className="bg-slate-800 border-slate-700 rounded-sm max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight text-2xl">Bulk Import</DialogTitle>
          <DialogDescription className="text-slate-400 text-sm">Paste a list of handles/URLs or import a JSON file. Categories are auto-created. Existing handles are merged.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="paste" className="mt-2">
          <TabsList className="bg-slate-900 rounded-sm border border-slate-700 h-10">
            <TabsTrigger value="paste" data-testid="tab-paste" className="rounded-sm data-[state=active]:bg-[#0076B6] data-[state=active]:text-white font-mono text-xs uppercase tracking-widest">
              <ListPlus className="w-3.5 h-3.5 mr-1.5" /> Paste List
            </TabsTrigger>
            <TabsTrigger value="json" data-testid="tab-json" className="rounded-sm data-[state=active]:bg-[#0076B6] data-[state=active]:text-white font-mono text-xs uppercase tracking-widest">
              <FileJson className="w-3.5 h-3.5 mr-1.5" /> JSON File
            </TabsTrigger>
          </TabsList>
          <TabsContent value="paste" className="mt-4 space-y-3">
            <Textarea data-testid="bulk-paste-textarea" value={pasteText} onChange={(e) => setPasteText(e.target.value)}
              placeholder={"@handle\nhttps://instagram.com/another\nthird_user"} rows={8}
              className="bg-slate-900 border-slate-600 rounded-sm font-mono text-sm focus-visible:ring-[#0076B6] resize-y" />
            <Button data-testid="bulk-paste-submit" disabled={busy || !pasteText.trim()} onClick={handlePaste}
              className="w-full h-11 rounded-sm bg-[#0076B6] hover:bg-[#0089d3] text-white font-display uppercase tracking-widest font-bold">
              {busy ? "Importing…" : "Import List"}
            </Button>
          </TabsContent>
          <TabsContent value="json" className="mt-4 space-y-3">
            <div className="border border-dashed border-slate-600 rounded-sm p-6 text-center">
              <Upload className="w-8 h-8 text-[#0076B6] mx-auto mb-2" />
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B0B7BC] mb-1">Drop your rolodex backup</div>
              <p className="text-xs text-slate-500 mb-3">Accepts the JSON format exported by this app, or any array of <code className="text-[#B0B7BC]">{`{username, categories}`}</code>.</p>
              <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" data-testid="bulk-json-input" />
              <Button data-testid="bulk-json-pick" disabled={busy} onClick={() => fileRef.current?.click()}
                className="rounded-sm bg-[#0076B6] hover:bg-[#0089d3] text-white font-display uppercase tracking-widest font-bold">
                {busy ? "Importing…" : "Choose File"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        {progress && (
          <div data-testid="bulk-progress" className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-700 pt-4">
            <Stat label="Added" value={progress.added} color="text-[#0076B6]" />
            <Stat label="Merged" value={progress.merged} color="text-[#B0B7BC]" />
            <Stat label="Errors" value={progress.error} color="text-red-400" />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-sm text-slate-400 hover:text-white">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="border border-slate-700 rounded-sm p-3 text-center">
      <div className={`font-display text-3xl font-black ${color}`}>{value}</div>
      <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-slate-500 mt-1">{label}</div>
    </div>
  );
}
