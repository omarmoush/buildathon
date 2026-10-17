import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { PackageSearch, X } from "lucide-react";
import { api, ApiError } from "../quiz/api";
import type { Language } from "../quiz/types";

// "Track your order": the short order ID opens the same buyer page as the private link.
export function TrackOrderDialog({ lang, open, onClose }: { lang: Language; open: boolean; onClose: () => void }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setError("");
    try {
      const { token } = await api<{ token: string }>(`/api/track/${encodeURIComponent(code.trim())}`);
      setLocation(`/b/${encodeURIComponent(token)}`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429
        ? t("محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.", "Too many attempts. Wait a moment and try again.")
        : err instanceof ApiError && err.status === 404
          ? t("لا يوجد طلب بهذا الرقم. تأكد من الرقم كما ظهر بعد إرسال الطلب.", "No order matches this ID. Check it against the one shown after you submitted.")
          : t("تعذّر البحث الآن. حاول مرة أخرى.", "Couldn't look that up right now. Try again."));
    } finally { setBusy(false); }
  }

  return <div className="modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="track-title" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="wl-mark" aria-hidden="true"><PackageSearch size={18} color="hsl(var(--sidebar-primary))" /></span>
          <div>
            <h2 id="track-title" className="font-display" style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800 }}>{t("تابع طلبك", "Track your order")}</h2>
            <p style={{ margin: "2px 0 0", color: "hsl(var(--muted-foreground))", fontSize: ".9rem" }}>{t("ادخل برقم الطلب لمعرفة حالته.", "Sign in with your order ID to see its status.")}</p>
          </div>
        </div>
        <button className="btn btn-outline" style={{ minHeight: 38, padding: "6px 9px" }} onClick={onClose} aria-label={t("إغلاق", "Close")}><X size={16} /></button>
      </div>
      <form onSubmit={submit} style={{ marginTop: 20, display: "grid", gap: 14 }}>
        <label>
          <span className="label">{t("رقم الطلب", "Order ID")}</span>
          <input ref={input} className="input" dir="ltr" autoComplete="off" spellCheck={false} placeholder="AK-XXXX-XXXX" data-testid="input-order-code"
            value={code} maxLength={20} onChange={event => setCode(event.target.value.toUpperCase())} style={{ fontWeight: 700, letterSpacing: ".06em" }} />
        </label>
        {error && <p role="alert" style={{ margin: 0, borderRadius: 12, padding: 12, background: "hsl(3 55% 96%)", color: "hsl(var(--destructive))", fontSize: ".9rem" }}>{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !code.trim()} data-testid="button-track-order">{busy ? t("جارٍ البحث…", "Looking up…") : t("اعرض حالة الطلب", "Show order status")}</button>
        <p style={{ margin: 0, color: "hsl(var(--muted-foreground))", fontSize: ".82rem" }}>{t("تجد رقم الطلب في صفحة التأكيد بعد إرسال طلبك، وفي صفحة طلبك.", "You'll find the order ID on the confirmation screen after submitting, and on your order page.")}</p>
      </form>
    </div>
  </div>;
}
