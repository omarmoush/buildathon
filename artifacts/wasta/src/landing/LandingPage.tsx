import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Hammer, Languages, RotateCw, Sparkles, Ruler, Armchair } from "lucide-react";
import { api } from "../quiz/api";
import type { CatalogItem, Language } from "../quiz/types";
import Furniture3D from "../buyer/Furniture3D";
import "./landing.css";

const PRODUCTS: { id: string; ar: string; en: string }[] = [
  { id: "bedroom-set", ar: "غرفة نوم", en: "Bedroom set" },
  { id: "wardrobe", ar: "دولاب", en: "Wardrobe" },
  { id: "dining-set", ar: "سفرة", en: "Dining set" },
  { id: "living-room", ar: "غرفة معيشة", en: "Living room" },
  { id: "other", ar: "قطعة أخرى", en: "Something else" },
];

export default function LandingPage() {
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem("wasta-lang") === "en" ? "en" : "ar"));
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const rtl = lang === "ar";
  const Arrow = rtl ? ArrowLeft : ArrowRight;
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [product, setProduct] = useState("bedroom-set");

  const load = useCallback(() => {
    setFailed(false); setItems(null);
    api<CatalogItem[]>("/api/catalog").then(setItems).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { localStorage.setItem("wasta-lang", lang); document.documentElement.lang = lang; }, [lang]);

  const current = useMemo(() => items?.find(i => i.id === selected), [items, selected]);
  const name = (i: CatalogItem) => (rtl ? i.nameAr || i.name : i.name);

  return (
    <div className="wl grain" dir={rtl ? "rtl" : "ltr"} lang={lang} style={{ fontFamily: rtl ? "'IBM Plex Sans Arabic',sans-serif" : undefined }}>
      <header className="wl-nav">
        <div className="wl-wrap">
          <Link href="/" className="wl-logo" aria-label="Wasta">
            <span className="wl-mark" aria-hidden="true"><Hammer size={18} color="hsl(var(--sidebar-primary))" /></span>
            {t("وسطة", "Wasta")}
          </Link>
          <nav className="wl-links" aria-label={t("التنقل", "Main")}>
            <a href="#paths">{t("ابدأ", "Start")}</a>
            <a href="#catalog">{t("الكتالوج", "Catalog")}</a>
            <a href="#how">{t("كيف تعمل", "How it works")}</a>
            <a href="#cost">{t("التكلفة", "Cost")}</a>
          </nav>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn btn-outline" style={{ minHeight: 40, padding: "6px 12px" }} onClick={() => setLang(rtl ? "en" : "ar")} aria-label={t("Switch to English", "التبديل إلى العربية")}>
              <Languages size={16} /> {rtl ? "EN" : "عربي"}
            </button>
            <Link href="/owner" className="btn btn-soft" style={{ minHeight: 40, padding: "6px 12px" }}>{t("دخول الورشة", "Workshop sign-in")}</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="wl-hero">
          <div className="wl-wrap">
            <div className="page-enter">
              <span className="wl-eyebrow">{t("من ورش دمياط إلى بيتك", "From Damietta workshops to your home")}</span>
              <h1 className="wl-h1">{t("اختار أثاثك، وافهم تكلفته", "Pick your furniture, understand its cost")}<em>{t(" قبل ما تطلب.", " before you order.")}</em></h1>
              <p className="wl-lead">{t("وسطة بتوصلك بورش أثاث دمياط. اختار من الكتالوج، عدّل المقاسات والخشب، أو اوصف اللي في بالك، وخد تقدير استرشادي قبل أي التزام.", "Wasta connects you with Damietta furniture workshops. Choose from the catalog, customize sizes and wood, or describe what you imagine, and get an indicative estimate before committing.")}</p>
              <div className="wl-cta">
                <Link href="/quiz" className="btn btn-primary" data-testid="link-start-quiz">{t("ابدأ التصميم", "Start designing")} <Arrow size={18} /></Link>
                <a href="#catalog" className="btn btn-outline">{t("تصفح الكتالوج", "Browse the catalog")}</a>
              </div>
            </div>
            <div className="wl-art" aria-hidden="true">
              <svg viewBox="0 0 400 420" preserveAspectRatio="xMidYMid slice">
                <circle cx="300" cy="90" r="46" fill="hsl(36 67% 72%)" />
                <rect x="0" y="300" width="400" height="120" fill="hsl(156 24% 21%)" />
                <rect x="70" y="170" width="120" height="130" rx="6" fill="hsl(24 73% 56%)" />
                <rect x="80" y="180" width="48" height="110" rx="3" fill="hsl(24 60% 44%)" />
                <rect x="134" y="180" width="48" height="110" rx="3" fill="hsl(24 60% 44%)" />
                <rect x="215" y="230" width="130" height="14" rx="4" fill="hsl(36 67% 72%)" />
                <rect x="225" y="244" width="10" height="56" fill="hsl(36 67% 72%)" />
                <rect x="325" y="244" width="10" height="56" fill="hsl(36 67% 72%)" />
              </svg>
              <div className="wl-note">{t("رسم توضيحي، وليس صورة منتج حقيقي.", "Illustration, not a photo of a real product.")}</div>
            </div>
          </div>
        </section>

        <section className="wl-sec alt" id="paths" aria-labelledby="paths-h">
          <div className="wl-wrap">
            <h2 className="wl-h2" id="paths-h">{t("ثلاث طرق للبداية", "Three ways to begin")}</h2>
            <p className="wl-sub">{t("اختار القطعة اللي تناسبك. كل طريق يوصلك لنفس الخطوات الستة.", "Choose what fits you. Every route leads into the same six steps.")}</p>
            <div className="wl-paths">
              <Link href={`/quiz?product=${product}&source=catalog`} className="wl-path" data-testid="link-source-catalog">
                <span className="wl-num">1</span><h3>{t("من الكتالوج", "From the catalog")}</h3>
                <p>{t("ابدأ بتصميم جاهز واعرضه ثلاثي الأبعاد.", "Start from a ready design and view it in 3D.")}</p>
                <Armchair size={22} />
              </Link>
              <Link href={`/quiz?product=${product}&source=customized`} className="wl-path" data-testid="link-source-customized">
                <span className="wl-num">2</span><h3>{t("خصّصها", "Customize it")}</h3>
                <p>{t("غيّر المقاس والخشب والتشطيب.", "Change the size, wood and finish.")}</p>
                <Ruler size={22} />
              </Link>
              <Link href={`/quiz?product=${product}&source=generated`} className="wl-path" data-testid="link-source-generated">
                <span className="wl-num">3</span><h3>{t("اوصفها", "Describe it")}</h3>
                <p>{t("اكتب فكرتك وهنولّد لك تصميمًا مبدئيًا.", "Write your idea and we generate a first design.")}</p>
                <Sparkles size={22} />
              </Link>
            </div>
            <div className="wl-tabs" role="group" aria-label={t("نوع القطعة", "Piece type")} style={{ marginTop: 24, marginBottom: 0 }}>
              {PRODUCTS.map(p => (
                <button key={p.id} className="wl-chip" aria-pressed={product === p.id} onClick={() => setProduct(p.id)}>{rtl ? p.ar : p.en}</button>
              ))}
            </div>
          </div>
        </section>

        <section className="wl-sec" id="catalog" aria-labelledby="cat-h">
          <div className="wl-wrap">
            <h2 className="wl-h2" id="cat-h">{t("من كتالوج الورش", "From the workshop catalog")}</h2>
            <p className="wl-sub">{t("الصور تمثيلية وليست منتجات مصوّرة. اختار قطعة لتراها بالتفصيل.", "Images are representative, not photographed products. Select a piece for detail.")}</p>
            {failed ? (
              <div className="wl-err" role="alert">
                <span>{t("تعذّر تحميل الكتالوج.", "Couldn't load the catalog.")}</span>
                <button className="btn btn-primary" onClick={load} data-testid="button-retry-catalog"><RotateCw size={16} /> {t("إعادة المحاولة", "Retry")}</button>
              </div>
            ) : !items ? (
              <div className="wl-grid" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 250, borderRadius: 20 }} />)}</div>
            ) : items.length === 0 ? (
              <div className="wl-err">{t("الكتالوج فارغ حاليًا، لكن يمكنك البدء بتخصيص أو وصف قطعتك.", "The catalog is empty right now, but you can still customize or describe a piece.")}
                <Link href="/quiz?source=customized" className="btn btn-soft">{t("ابدأ", "Start")}</Link></div>
            ) : (
              <>
                <div className="wl-grid">
                  {items.map(i => (
                    <button key={i.id} className="wl-card" aria-pressed={selected === i.id} onClick={() => setSelected(selected === i.id ? null : i.id)} data-testid={`card-catalog-${i.id}`}>
                      <span className="wl-thumb">{i.thumbnailUrl ? <img src={i.thumbnailUrl} alt="" loading="lazy" /> : <Armchair size={40} />}</span>
                      <span className="wl-body"><b>{name(i)}</b><small>{i.defaultDims.w} × {i.defaultDims.d} × {i.defaultDims.h} {t("سم", "cm")}</small></span>
                    </button>
                  ))}
                </div>
                {current && (
                  <div className="wl-detail" aria-live="polite">
                    <div>{current.glbUrl ? <Furniture3D model={current} lang={lang} /> : current.thumbnailUrl && <img src={current.thumbnailUrl} alt="" style={{ width: "100%", borderRadius: 16 }} />}</div>
                    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
                      <h3 className="wl-h2" style={{ fontSize: "1.6rem" }}>{name(current)}</h3>
                      <p className="wl-sub" style={{ margin: 0 }}>
                        {t("الخشب: ", "Wood: ")}{current.woods.join("، ")}<br />{t("التشطيب: ", "Finish: ")}{current.finishes.join("، ")}
                      </p>
                      <Link href={`/quiz?source=catalog&item=${encodeURIComponent(current.id)}&product=${product}`} className="btn btn-primary" data-testid="link-use-item">{t("ابدأ بهذه القطعة", "Start with this piece")} <Arrow size={18} /></Link>
                      <Link href={`/quiz?source=customized&item=${encodeURIComponent(current.id)}&product=${product}`} className="btn btn-outline">{t("خصّصها", "Customize it")}</Link>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="wl-sec alt" id="how" aria-labelledby="how-h">
          <div className="wl-wrap">
            <h2 className="wl-h2" id="how-h">{t("من الفكرة للورشة", "From idea to workshop")}</h2>
            <p className="wl-sub">{t("خطوات واضحة، وأنت اللي بتقرر.", "Clear steps, and you decide.")}</p>
            <ol className="wl-steps">
              <li><b>{t("اختار أو اوصف", "Choose or describe")}</b><span>{t("كتالوج، تخصيص، أو وصف بالكلمات.", "Catalog, customization, or words.")}</span></li>
              <li><b>{t("خد تقدير استرشادي", "Get an indicative estimate")}</b><span>{t("تعرف الرقم التقريبي قبل ما تلتزم.", "See a rough figure before committing.")}</span></li>
              <li><b>{t("الورشة تراجع وتعتمد", "Workshop reviews and approves")}</b><span>{t("الورشة تعتمد التصميم وتقدّم عرضًا نهائيًا.", "The workshop approves the design and sends a final quote.")}</span></li>
            </ol>
          </div>
        </section>

        <section className="wl-sec" id="cost" aria-labelledby="cost-h">
          <div className="wl-wrap">
            <div className="wl-pay">
              <div>
                <h2 className="wl-h2" id="cost-h">{t("التكلفة بوضوح", "Cost, plainly")}</h2>
                <p>{t("ما تراه أولًا تقدير استرشادي. بعد اعتماد الورشة للتصميم يصلك العرض النهائي. العربون المتوقع 50% من العرض النهائي.", "What you see first is an indicative estimate. After the workshop approves the design you get a final quote. The expected deposit is 50% of that final quote.")}</p>
              </div>
              <div>
                <div className="wl-bar" aria-hidden="true"><i /></div>
                <p style={{ margin: 0, fontSize: ".9rem" }}>{t("الدفع الإلكتروني غير متاح حاليًا، ولا يوجد دفع فعلي عبر الموقع.", "Online payment isn't available yet, and nothing is charged through the site.")}</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="wl-foot">
        <div className="wl-wrap">
          <span>{t("وسطة، ورش دمياط للأثاث", "Wasta, Damietta furniture workshops")}</span>
          <span style={{ display: "flex", gap: 16 }}>
            <Link href="/quiz">{t("ابدأ", "Start")}</Link>
            <Link href="/owner">{t("دخول الورشة / الإدارة", "Workshop / admin sign-in")}</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
