import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

function buildPlain(profiles) { return profiles.map((p) => `@${p.username}`).join("\n"); }
function buildUrls(profiles) { return profiles.map((p) => `https://instagram.com/${p.username}`).join("\n"); }
function buildMarkdown(profiles, categories) {
  const byCat = {}; const uncat = [];
  for (const p of profiles) {
    if (!p.category_ids?.length) uncat.push(p);
    for (const cid of p.category_ids || []) {
      const cat = categories.find((c) => c.id === cid);
      if (!cat) continue;
      (byCat[cat.name] ||= []).push(p);
    }
  }
  const out = [`# Instagram Rolodex (${profiles.length} profiles)`, ""];
  for (const name of Object.keys(byCat).sort()) {
    out.push(`## ${name} (${byCat[name].length})`);
    for (const p of byCat[name]) {
      const fn = p.full_name ? ` — ${p.full_name}` : "";
      out.push(`- [@${p.username}](https://instagram.com/${p.username})${fn}`);
    }
    out.push("");
  }
  if (uncat.length) {
    out.push(`## Uncategorized (${uncat.length})`);
    for (const p of uncat) out.push(`- [@${p.username}](https://instagram.com/${p.username})`);
  }
  return out.join("\n");
}
function buildCsv(profiles, categories) {
  const rows = [["username", "full_name", "categories", "instagram_url"]];
  for (const p of profiles) {
    const cats = (p.category_ids || []).map((id) => categories.find((c) => c.id === id)?.name).filter(Boolean).join("; ");
    rows.push([p.username, (p.full_name || "").replaceAll('"', '""'), cats, `https://instagram.com/${p.username}`]);
  }
  return rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
}

export default function CopyDialog({ profiles, categories, trigger }) {
  const [copiedTab, setCopiedTab] = useState(null);
  const formats = {
    handles: { label: "Handles", build: () => buildPlain(profiles) },
    urls: { label: "URLs", build: () => buildUrls(profiles) },
    markdown: { label: "Markdown", build: () => buildMarkdown(profiles, categories) },
    csv: { label: "CSV", build: () => buildCsv(profiles, categories) },
    json: { label: "JSON", build: () => JSON.stringify(profiles.map((p) => ({
      username: p.username, full_name: p.full_name, is_verified: p.is_verified,
      categories: (p.category_ids || []).map((id) => categories.find((c) => c.id === id)?.name).filter(Boolean),
    })), null, 2) },
  };
  const copy = async (key) => {
    await navigator.clipboard.writeText(formats[key].build());
    setCopiedTab(key); toast.success(`${formats[key].label} copied`);
    setTimeout(() => setCopiedTab(null), 1500);
  };
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent data-testid="copy-dialog" className="bg-slate-800 border-slate-700 rounded-sm max-w-3xl">
        <DialogHeader><DialogTitle className="font-display uppercase tracking-tight text-2xl">Copy Rolodex</DialogTitle></DialogHeader>
        <Tabs defaultValue="handles">
          <TabsList className="bg-slate-900 rounded-sm border border-slate-700 h-10 flex-wrap">
            {Object.entries(formats).map(([k, f]) => (
              <TabsTrigger key={k} value={k} data-testid={`copy-tab-${k}`} className="rounded-sm data-[state=active]:bg-[#0076B6] data-[state=active]:text-white font-mono text-xs uppercase tracking-widest">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {Object.entries(formats).map(([k, f]) => (
            <TabsContent key={k} value={k} className="mt-3">
              <div className="relative">
                <pre data-testid={`copy-pre-${k}`} className="bg-slate-900 border border-slate-700 rounded-sm p-4 text-xs text-slate-300 font-mono max-h-80 overflow-auto whitespace-pre-wrap break-all">
                  {f.build() || "(empty)"}
                </pre>
                <Button data-testid={`copy-btn-${k}`} onClick={() => copy(k)} className="absolute top-2 right-2 h-8 rounded-sm bg-[#0076B6] hover:bg-[#0089d3] text-white font-display uppercase tracking-widest text-xs font-bold">
                  {copiedTab === k ? (<><ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Copied</>) : (<><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy</>)}
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
