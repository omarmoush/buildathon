import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Order } from "@workspace/api-client-react";
import { api } from "../quiz/api";
import { EstimateCard } from "../quiz/EstimateCard";

const money = (value: number) => `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value)} EGP`;
export function RequestReview({ order, lang, onUpdated }: { order: Order; lang: "ar" | "en"; onUpdated: () => Promise<void> }) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const [note, setNote] = useState(order.review?.note ?? "");
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  useEffect(() => { if (!dirty) setNote(order.review?.note ?? ""); }, [order.review?.note, dirty]);
  const reviewable = ["requested", "draft", "design_review", "deposit_paid"].includes(order.status);
  async function review(decision: "accepted" | "changes_requested") {
    if (busy.current) return;
    if (decision === "changes_requested" && !note.trim()) { setError(t("Describe what needs changing.", "اكتب التعديلات المطلوبة.")); return; }
    busy.current = true; setPending(true); setError("");
    try {
      await api(`/api/orders/${encodeURIComponent(order.id)}/review`, { decision, note: note.trim() });
      await onUpdated(); setDirty(false);
    } catch { setError(t("Review was not saved. Refresh the order and try again.", "تعذر حفظ المراجعة. حدّث الطلب وحاول مجدداً.")); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className="surface p-5 md:p-6" data-testid="owner-request-review">
    <h2 className="font-display text-lg font-bold">{order.depositReviewPending ? t("Deposit received · production review", "تم استلام العربون · مراجعة قبل التنفيذ") : t("Workshop review & estimate", "مراجعة الورشة والتقدير")}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{t("Review the specifications, advise the buyer, and keep the estimate separate from the final locked quote.", "راجع المواصفات ووضّح المطلوب للعميل. التقدير المبدئي منفصل عن عرض السعر النهائي المثبّت.")}</p>
    {order.review && <p className="mt-3 rounded-xl bg-secondary p-3 text-sm">{order.review.decision === "accepted" ? t("Review accepted", "تمت الموافقة على المراجعة") : t("Changes requested", "تم طلب تعديلات")}{order.review.note && ` · ${order.review.note}`}</p>}
    {reviewable && <div className="mt-4 space-y-3">
      <label className="block"><span className="label">{t("Review note for the buyer", "ملاحظة مراجعة للعميل")}</span><textarea className="input min-h-24" maxLength={2000} value={note} onChange={event => { setNote(event.target.value); setDirty(true); }} /></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => review("accepted")} data-testid="accept-order-review">{pending ? t("Saving…", "جارٍ الحفظ…") : order.status === "deposit_paid" ? t("Accept deposited order", "اعتماد الطلب المدفوع") : t("Accept & send design for approval", "قبول وإرسال التصميم للموافقة")}</button>
        <button type="button" className="btn btn-outline" disabled={pending} onClick={() => review("changes_requested")}>{t("Request changes", "طلب تعديلات")}</button>
      </div>
    </div>}
    {error && <p className="mt-3 text-sm text-red-800" role="alert">{error}</p>}
    {order.estimate && <div className="wb wb-embedded mt-5"><EstimateCard estimate={order.estimate} lang={lang} saved /></div>}
    {!order.quote && ["requested", "draft", "design_review"].includes(order.status) && <EstimateEditor order={order} lang={lang} onUpdated={onUpdated} />}
  </section>;
}

function EstimateEditor({ order, lang, onUpdated }: { order: Order; lang: "ar" | "en"; onUpdated: () => Promise<void> }) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ materials: "", labor: "", margin: "25", deposit: "50" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const total = (Number(form.materials) + Number(form.labor)) * (1 + Number(form.margin) / 100);
  const valid = [form.materials, form.labor, form.margin, form.deposit].every(value => value !== "" && Number.isFinite(Number(value))) &&
    Number(form.materials) >= 0 && Number(form.labor) >= 0 && Number(form.margin) >= 0 && Number(form.margin) <= 1000 &&
    Number(form.deposit) > 0 && Number(form.deposit) <= 100 && total > 0;
  const openEditor = () => {
    setForm({ materials: String(order.estimate?.materialsEgp ?? ""), labor: String(order.estimate?.laborEgp ?? ""),
      margin: String(order.estimate?.marginPercent ?? 25), deposit: String((order.estimate?.depositPercent ?? .5) * 100) });
    setError(""); setOpen(true);
  };
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy.current || !valid) return;
    busy.current = true; setPending(true); setError("");
    try {
      await api(`/api/orders/${encodeURIComponent(order.id)}/estimate`, { materialsEgp: Number(form.materials),
        laborEgp: Number(form.labor), marginPercent: Number(form.margin), depositPercent: Number(form.deposit) / 100 });
      await onUpdated(); setOpen(false);
    } catch { setError(t("Estimate was not saved. Check costs or refresh the order.", "تعذر حفظ التقدير. راجع التكاليف أو حدّث الطلب.")); }
    finally { busy.current = false; setPending(false); }
  }
  if (!open) return <button type="button" className="btn btn-outline mt-4" onClick={openEditor}>{t("Give / update indicative estimate", "إضافة / تعديل التقدير المبدئي")}</button>;
  return <form className="mt-5 space-y-4 border-t border-border pt-5" onSubmit={save}>
    <h3 className="font-bold">{t("Workshop estimate · not a final quote", "تقدير الورشة · ليس عرض سعر نهائياً")}</h3>
    <div className="grid grid-cols-2 gap-3">{([
      ["materials", t("Materials · EGP", "الخامات · جنيه"), 100000000], ["labor", t("Labor · EGP", "المصنعية · جنيه"), 100000000],
      ["margin", t("Cost markup · %", "الربح على التكلفة · ٪"), 1000], ["deposit", t("Estimated deposit · %", "العربون التقديري · ٪"), 100],
    ] as const).map(([key, label, max]) => <label key={key}><span className="label">{label}</span><input className="input" required type="number" min={key === "deposit" ? 1 : 0} max={max} step=".01" value={form[key]} onChange={event => setForm(value => ({ ...value, [key]: event.target.value }))} /></label>)}</div>
    <p className="text-sm font-semibold">{t("Planning total", "الإجمالي التقديري")}: {money(Number.isFinite(total) ? total : 0)} · {t("Deposit", "العربون")}: {money(valid ? total * Number(form.deposit) / 100 : 0)}</p>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="flex gap-2"><button className="btn btn-primary" type="submit" disabled={!valid || pending}>{pending ? t("Saving…", "جارٍ الحفظ…") : t("Send estimate to buyer", "إرسال التقدير للعميل")}</button><button className="btn btn-outline" type="button" disabled={pending} onClick={() => setOpen(false)}>{t("Cancel", "إلغاء")}</button></div>
  </form>;
}

export function ReviewQueue({ orders, lang, filter, onFilter }: { orders: Order[]; lang: "ar" | "en"; filter: string; onFilter: (value: string) => void }) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const pending = orders.filter(order => order.status === ("requested" as Order["status"]) || order.status === "draft" || order.depositReviewPending).length;
  const deposited = orders.filter(order => order.payments.some(payment => payment.type === "deposit" && payment.state !== "pending")).length;
  return <section className="surface mt-5 p-5" data-testid="owner-review-queue">
    <h2 className="font-display text-lg font-bold">{t("Review queue", "قائمة المراجعة")}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{t("New requests and verified-deposit orders awaiting workshop approval. Pending checkout is never counted as paid.", "طلبات جديدة وطلبات بعربون مؤكّد تنتظر اعتماد الورشة. بدء عملية الدفع لا يُعتبر دفعاً مؤكداً.")}</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <button className={`btn ${filter === "review" ? "btn-primary" : "btn-outline"}`} aria-pressed={filter === "review"} onClick={() => onFilter(filter === "review" ? "all" : "review")}>{t("Pending review", "تنتظر المراجعة")} · {pending}</button>
      <button className={`btn ${filter === "deposited" ? "btn-primary" : "btn-outline"}`} aria-pressed={filter === "deposited"} onClick={() => onFilter(filter === "deposited" ? "all" : "deposited")}>{t("Deposited orders", "طلبات بعربون")} · {deposited}</button>
    </div>
  </section>;
}
