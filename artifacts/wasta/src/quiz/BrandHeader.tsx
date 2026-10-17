import { Hammer, Languages } from "lucide-react";
import { Link } from "wouter";
import type { Language } from "./types";

// Same brand bar as the landing page, for the buyer request form and buyer order page.
export function BrandHeader({ lang, onToggleLanguage, meta }: { lang: Language; onToggleLanguage: () => void; meta?: string }) {
  return <header>
    <Link href="/" className="wb-logo" aria-label="Akshab">
      <span className="wb-mark" aria-hidden="true"><Hammer size={18} /></span>
      {lang === "ar" ? "أخشاب" : "Akshab"}
    </Link>
    {meta && <span className="wb-header-meta">{meta}</span>}
    <button onClick={onToggleLanguage} aria-label={lang === "ar" ? "Switch to English" : "التبديل للعربية"} style={{ minHeight: 40, padding: "6px 12px" }}>
      <Languages size={16} /> {lang === "ar" ? "EN" : "عربي"}
    </button>
  </header>;
}

/** Simulated escrow: Akshab holds the buyer's money between payment and delivery. Text only, no real account. */
export function EscrowSteps({ lang, stage }: { lang: Language; stage: number }) {
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;
  const steps = [
    [t("تدفع العربون لأخشاب", "You pay the deposit to Akshab"), t("يذهب المبلغ إلى حساب ضمان أخشاب، وليس إلى الورشة مباشرة.", "The money goes to Akshab's escrow account, not straight to the workshop.")],
    [t("أخشاب تحتفظ بالمبلغ", "Akshab holds the money"), t("الورشة تصنّع وهي تعرف أن العربون مضمون؛ ولا تستطيع سحبه بعد.", "The workshop builds knowing the deposit is secured, but cannot withdraw it yet.")],
    [t("تستلم وتؤكد", "You receive and confirm"), t("بعد فحص الأثاث تؤكد الاستلام وتدفع المتبقي لأخشاب.", "After inspecting the furniture you confirm delivery and pay the balance to Akshab.")],
    [t("أخشاب تحوّل للورشة", "Akshab pays the workshop"), t("نحوّل العربون والمتبقي للورشة. إذا حدثت مشكلة، أخشاب تتدخل كوسيط.", "We release the deposit and balance to the workshop. If something goes wrong, Akshab steps in as the middleman.")],
  ];
  return <section className="wb-card" aria-label={t("حساب الضمان", "Escrow")}>
    <span className="wb-eyebrow">{t("أخشاب وسيط ضامن", "Akshab escrow")}</span>
    <h2 style={{ marginTop: 10 }}>{t("فلوسك محفوظة عند أخشاب حتى الاستلام", "Your money stays with Akshab until delivery")}</h2>
    <ol className="wb-escrow">{steps.map(([title, text], index) =>
      <li key={title} className={index < stage ? "done" : index === stage ? "current" : undefined} aria-current={index === stage ? "step" : undefined}>
        <i>{index < stage ? "✓" : index + 1}</i><div><b>{title}</b><span>{text}</span></div>
      </li>)}
    </ol>
    <p className="wb-muted">{t("محاكاة توضيحية: لا يوجد حساب ضمان حقيقي في هذا العرض.", "Simulation for this demo: there is no real escrow account.")}</p>
  </section>;
}
