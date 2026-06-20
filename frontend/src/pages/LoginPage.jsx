import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatApiError } from "@/lib/api";
import { Lock, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user && user !== false) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try { await login(email, password); }
    catch (e) { setErr(formatApiError(e?.response?.data?.detail) || "Login failed"); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid="login-page" className="min-h-screen relative flex items-center justify-center bg-slate-900 bg-field-grid px-4">
      <div className="absolute inset-0 bg-noise pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-1 honolulu-stripe" />
      <div className="relative w-full max-w-md">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[#0076B6] flex items-center justify-center rounded-sm">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="text-xs font-mono uppercase tracking-[0.25em] text-[#B0B7BC]">Detroit Edition · v2</div>
          </div>
          <h1 className="font-display text-5xl sm:text-6xl font-black uppercase tracking-tighter text-white leading-[0.9]" data-testid="login-title">
            Social<br /><span className="text-[#0076B6]">Rolodex</span>
          </h1>
          <p className="mt-4 text-sm text-slate-400 max-w-sm">Restricted access. Sign in to manage your Instagram playbook.</p>
        </div>
        <form onSubmit={onSubmit} className="border border-slate-700 bg-slate-800/80 backdrop-blur p-6 sm:p-8 rounded-sm space-y-5" data-testid="login-form">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-700">
            <Lock className="w-4 h-4 text-[#B0B7BC]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B0B7BC]">Admin Sign-In</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-400">Email</Label>
            <Input id="email" data-testid="login-email-input" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-900 border-slate-600 rounded-sm h-11 focus-visible:ring-[#0076B6]"
              placeholder="admin@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-400">Password</Label>
            <Input id="password" data-testid="login-password-input" type="password" required autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-900 border-slate-600 rounded-sm h-11 focus-visible:ring-[#0076B6]" />
          </div>
          {err && (
            <div data-testid="login-error" className="text-sm border-l-2 border-red-500 bg-red-500/10 text-red-300 px-3 py-2 rounded-sm">{err}</div>
          )}
          <Button type="submit" disabled={busy} data-testid="login-submit-button"
            className="w-full h-11 rounded-sm bg-[#0076B6] hover:bg-[#0089d3] text-white font-display uppercase tracking-widest text-base font-bold">
            {busy ? "Signing in…" : "Enter Playbook"}
          </Button>
        </form>
        <div className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">Detroit · Honolulu Blue · Silver</div>
      </div>
    </div>
  );
}
