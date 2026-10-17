import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { demoCatalog, demoOrder, initialSpec } from "./demo";
import PieceStep, { GenerationPanel } from "./PieceStep";
import { useFurnitureGeneration } from "./useFurnitureGeneration";
import Furniture3D from "../buyer/Furniture3D";
import { EstimateCard, EstimatePreview, usePaymentsConnected } from "./EstimateCard";
import type { FurnitureEstimate } from "@workspace/api-client-react";
import type { CatalogItem, Language, Spec } from "./types";
import { BrandHeader, EscrowSteps } from "./BrandHeader";
import { artUrl, CATEGORIES, categoryLabel, FINISH_LABELS, label, PRODUCT_PIECES, productTypeFor, recolor, STYLES, swatch, WOOD_LABELS } from "./furniture";
import "./buyer.css";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export default function QuizPage() {
  const demo = new URLSearchParams(window.location.search).get("demo") === "1";
  const [lang, setLang] = useState<Language>(() => localStorage.getItem("wasta-lang") === "en" ? "en" : "ar");
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;
  const [step, setStep] = useState(0);
  const entry = useRef(new URLSearchParams(window.location.search)).current;
  const [spec, setSpec] = useState<Spec>(() => {
    const product = entry.get("product");
    const source = entry.get("source");
    const pieces = product && PRODUCT_PIECES[product] ? [...PRODUCT_PIECES[product]] : [...(initialSpec.pieces || [])];
    return { ...initialSpec, dimensions: { ...initialSpec.dimensions }, style: [...initialSpec.style],
      productType: pieces.length ? productTypeFor(pieces) : product && PRODUCT_PIECES[product] ? product : initialSpec.productType,
      pieceSource: source === "customized" || source === "generated" ? source : "catalog",
      bedroomPieces: undefined, pieces,
    };
  });
  const [catalog, setCatalog] = useState<CatalogItem[]>(demo ? demoCatalog : []);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const prefilled = useRef(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState<{ orderId: string; token: string; orderCode?: string; estimate?: FurnitureEstimate | null }>();
  const [copied, setCopied] = useState(false);
  const submitting = useRef(false);
  const generation = useFurnitureGeneration();
  const paymentsConnected = usePaymentsConnected();
  const patch = (values: Partial<Spec>) => setSpec(old => ({ ...old, ...values }));
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = [
    t("القطع المطلوبة", "Pieces you need"), t("الطراز", "Style"), t("اختيار القطعة", "Your piece"),
    t("المقاسات والخامات", "Size & materials"), t("التوصيل", "Delivery"), t("التواصل", "Contact"),
  ];
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    setCatalogError(false);
    api<CatalogItem[]>("/api/catalog", undefined, controller.signal).then(setCatalog).catch(() => { if (!controller.signal.aborted) setCatalogError(true); });
    return () => controller.abort();
  }, [demo, catalogVersion]);
  useEffect(() => {
    if (prefilled.current || !catalog.length) return;
    prefilled.current = true;
    const selected = catalog.find(item => item.id === entry.get("item"));
    if (selected && entry.get("source") !== "generated") {
      setSpec(old => {
        const pieces = selected.category && !old.pieces?.includes(selected.category) ? [selected.category, ...(old.pieces || [])] : old.pieces || [];
        const colors = { wood: selected.woods[0], finish: selected.finishes[0] };
        return { ...old, catalogItemId: selected.id, glbUrl: recolor(selected.glbUrl, colors), usdzUrl: selected.usdzUrl,
          thumbnailUrl: recolor(selected.thumbnailUrl, colors), dimensions: { ...selected.defaultDims }, ...colors,
          pieces, productType: productTypeFor(pieces) };
      });
    }
  }, [catalog, entry]);
  useEffect(() => { localStorage.setItem("wasta-lang", lang); }, [lang]);
  useEffect(() => { heading.current?.focus(); }, [step, success]);
  const item = catalog.find(item => item.id === spec.catalogItemId);
  // Changing wood or finish recolours the saved picture and 3D model, so the order shows the chosen material.
  const setMaterial = (values: { wood?: string; finish?: string }) => {
    const colors = { wood: values.wood ?? spec.wood, finish: values.finish ?? spec.finish };
    patch({ ...colors, glbUrl: recolor(spec.glbUrl, colors), thumbnailUrl: recolor(spec.thumbnailUrl, colors) });
  };
  const selectFallback = () => {
    const fallback = catalog.find(item => item.id === "bed-oak") || demoCatalog[0];
    generation.clear();
    patch({ pieceSource: "catalog", catalogItemId: fallback.id, glbUrl: recolor(fallback.glbUrl, { wood: fallback.woods[0], finish: fallback.finishes[0] }),
      usdzUrl: undefined, thumbnailUrl: fallback.thumbnailUrl, dimensions: { ...fallback.defaultDims },
      wood: fallback.woods[0], finish: fallback.finishes[0], prompt: undefined, generationTaskId: undefined });
  };
  const keep = () => {
    if (!generation.result?.glbUrl) return;
    patch({ pieceSource: "generated", catalogItemId: undefined, prompt: generation.prompt,
      glbUrl: generation.result.glbUrl, usdzUrl: generation.result.usdzUrl,
      thumbnailUrl: generation.result.thumbnailUrl, generationTaskId: generation.taskId });
  };
  const validate = (index: number): string => {
    if (index === 0 && !spec.pieces?.length) return t("اختر قطعة واحدة على الأقل.", "Choose at least one piece.");
    if (index === 1 && !spec.style.length) return t("اختر طرازاً واحداً أو اثنين.", "Choose one or two styles.");
    if (index === 2 && !spec.glbUrl && !(spec.pieceSource === "generated" && generation.pending && generation.taskId)) return t("اختر قطعة، أو ابدأ توليد نموذج.", "Choose a piece or start generating a model.");
    if (index === 3 && Object.values(spec.dimensions).some(n => !Number.isFinite(n) || n < 10 || n > 600)) return t("أدخل أبعاداً بين ١٠ و٦٠٠ سم.", "Enter dimensions between 10 and 600 cm.");
    if (index === 4 && (!spec.deliveryCity.trim() || !spec.wantedBy || spec.wantedBy < today())) return t("أدخل المدينة وموعداً غير سابق لليوم.", "Enter a city and a date that is not in the past.");
    if (index === 5 && (!name.trim() || !/^\+?[\d\s()-]{7,20}$/.test(phone) || phone.replace(/\D/g, "").length < 7)) return t("أدخل اسمك ورقم واتساب صحيحاً.", "Enter your name and a valid WhatsApp number.");
    return "";
  };
  async function submit() {
    if (submitting.current) return;
    for (let i = 0; i < 6; i++) {
      const invalid = validate(i);
      if (invalid) { setStep(i); setError(invalid); return; }
    }
    if (!spec.glbUrl) { setError(t("احتفظ بالنموذج بعد اكتماله أو اختر النموذج الجاهز أولاً.", "Keep the completed model or choose a prepared model first.")); return; }
    submitting.current = true; setBusy(true); setError("");
    try {
      const cleanSpec = { ...spec, deliveryCity: spec.deliveryCity.trim() };
      if (demo) {
        const order = { ...demoOrder(), buyerName: name.trim(), spec: cleanSpec, status: "requested", quote: null };
        sessionStorage.setItem("wasta-demo-order", JSON.stringify(order));
        setSuccess({ orderId: "demo-person2", token: "demo-person2" });
      } else {
        const result = await api<{ orderId: string; token: string; orderCode?: string; estimate?: FurnitureEstimate | null }>("/api/orders", {
          buyerName: name.trim(), buyerPhone: phone.trim(), buyerCountry: spec.deliveryCountry, spec: cleanSpec,
        });
        if (!result.token || !result.orderId) throw new Error("Invalid order response");
        setSuccess(result);
      }
    } catch (err) {
      setError(err instanceof ApiError && [401, 404, 422].includes(err.status)
        ? t("تعذر حفظ الطلب بهذه البيانات. اختياراتك ما زالت هنا؛ تحقق من البيانات وحاول مجدداً.", "The order could not be saved with these details. Your choices are still here; check them and retry.")
        : t("لم نتلق تأكيداً للطلب. لا تكرر الإرسال إذا كان قد وصل للورشة؛ تحقّق معها أولاً.", "No order confirmation was received. Check with the workshop before retrying to avoid a duplicate."));
    } finally { submitting.current = false; setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    if ((spec.referencePhotos?.length || 0) >= 5) { setError(t("يمكنك إرفاق ٥ صور كحد أقصى.", "You can attach up to five photos.")); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setError(t("اختر صورة JPG أو PNG أو WebP أقل من ٨ ميجابايت.", "Choose a JPG, PNG or WebP under 8 MB.")); return;
    }
    setUploading(true); setError("");
    try {
      const data = new FormData(); data.append("file", file);
      const uploaded = await api<{ url: string }>("/api/uploads", data);
      if (!uploaded.url) throw new Error("No upload URL");
      patch({ referencePhotos: [...(spec.referencePhotos || []), uploaded.url] });
    } catch { setError(t("تعذّر رفع الصورة. يمكنك المتابعة دونها.", "Photo upload failed. You can continue without it.")); }
    finally { setUploading(false); }
  }
  const magicLink = success ? `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/b/${encodeURIComponent(success.token)}${demo ? "?demo=1" : ""}` : "";
  return <div className="wb" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
    <BrandHeader lang={lang} onToggleLanguage={() => setLang(lang === "ar" ? "en" : "ar")} meta={t("ورشة رضا • دمياط", "Reda's workshop • Damietta")} />
    <main>
      {demo && <p className="wb-notice">{t("عرض تجريبي فقط — لا يُرسل طلباً حقيقياً ولا يحصّل أموالاً.", "Demo only — no real order is submitted and no money is collected.")}</p>}
      {success ? <section className="wb-card">
        <span className="wb-badge">{t("تم استلام الطلب", "Request received")}</span>
        <h1 ref={heading} tabIndex={-1}>{t("احتفظ برقم طلبك ورابطه", "Keep your order ID and link")}</h1>
        {success.orderCode && <div className="wb-notice">
          <p style={{ margin: 0 }}>{t("رقم الطلب", "Order ID")}</p>
          <p className="wb-code" data-testid="order-code" style={{ margin: "4px 0" }}>{success.orderCode}</p>
          <p className="wb-muted" style={{ margin: 0 }}>{t("ادخل به من الصفحة الرئيسية («تابع طلبك») لمعرفة الحالة في أي وقت.", "Use it on the home page (“Track your order”) to check the status any time.")}</p>
        </div>}
        <p>{t("راجع التصميم والسعر وتابع التصنيع من الرابط أو رقم الطلب دون إنشاء حساب. لا تشاركهما إلا مع من تثق به.", "Review the design and quote and follow production with the link or order ID, no account needed. Share them only with people you trust.")}</p>
        {success.estimate && <EstimateCard estimate={success.estimate} lang={lang} saved />}
        <p className="wb-notice">{paymentsConnected
          ? t("طلبك ينتظر مراجعة الورشة. لا يوجد أي مبلغ مستحق الآن، وستدفع العربون عبر Paymob من رابط طلبك بعد أن ترسل الورشة عرض السعر.", "Your request is awaiting workshop review. Nothing is payable yet; you'll pay the deposit through Paymob from your order link once the workshop sends a quote.")
          : t("طلبك ينتظر مراجعة الورشة. ربط Paymob قيد الانتظار، ولا يوجد أي مبلغ محصّل أو مستحق الدفع الآن.", "Your request is awaiting workshop review. Paymob setup is pending; no money was collected or is payable now.")}</p>
        <EscrowSteps lang={lang} stage={0} />
        <a className="wb-link wb-primary" href={magicLink}>{t("افتح طلبك", "Open your order")}</a>
        <label>{t("رابط الطلب الخاص", "Private order link")}<input readOnly value={magicLink} dir="ltr" onFocus={e => e.target.select()} /></label>
        <button onClick={() => navigator.clipboard.writeText(magicLink).then(() => setCopied(true)).catch(() => setError(t("انسخ الرابط من الحقل أعلاه.", "Copy the link from the field above.")))}>{copied ? t("تم النسخ", "Copied") : t("نسخ الرابط", "Copy link")}</button>
      </section> : <>
        <p className="wb-muted">{t("أثاث مصنوع لك، خطوة بخطوة", "Furniture made for you, step by step")}</p>
        <span className="wb-eyebrow">{t("الخطوة", "Step")} {step + 1} / 6</span>
        <div className="wb-steps" role="progressbar" aria-valuemin={1} aria-valuemax={6} aria-valuenow={step + 1} aria-label={t("تقدم الطلب", "Quiz progress")}>
          {steps.map((_, index) => <span key={index} className={index < step ? "done" : index === step ? "current" : undefined} />)}
        </div>
        <h1 ref={heading} tabIndex={-1}>{steps[step]}</h1>
        {step === 0 && <div className="wb-stack">
          <p className="wb-muted">{t("اختر كل القطع التي تحتاجها، من فئة واحدة أو أكثر.", "Pick every piece you need, from one category or several.")}</p>
          <div className="wb-grid wb-grid-4">{CATEGORIES.map(category => {
            const chosen = spec.pieces?.includes(category.id) || false;
            return <button className="wb-card wb-pick" key={category.id} aria-pressed={chosen} data-testid={`piece-${category.id}`} onClick={() => {
              const pieces = chosen ? (spec.pieces || []).filter(piece => piece !== category.id) : [...(spec.pieces || []), category.id];
              const keepItem = !!spec.catalogItemId && pieces.includes(catalog.find(item => item.id === spec.catalogItemId)?.category ?? "");
              patch({ pieces, productType: productTypeFor(pieces), bedroomPieces: undefined,
                ...(keepItem ? {} : { catalogItemId: undefined, glbUrl: spec.pieceSource === "generated" ? spec.glbUrl : undefined, usdzUrl: undefined, thumbnailUrl: undefined }) });
            }}>
              <span className="wb-tick" aria-hidden="true">{chosen ? "✓" : ""}</span>
              <img src={artUrl(category.id, { style: spec.style[0], wood: spec.wood, finish: spec.finish })} alt="" loading="lazy" />
              <strong>{category[lang]}</strong>
            </button>;
          })}</div>
        </div>}
        {step === 1 && <>
          <p>{t("اختر طرازاً واحداً أو اثنين. الصور تعرض القطع التي اخترتها بكل طراز.", "Pick up to two styles. Each picture shows the pieces you chose in that style.")}</p>
          <div className="wb-grid wb-grid-4">{STYLES.map(style => {
            const pieces = spec.pieces?.length ? spec.pieces : ["dresser"];
            return <button className="wb-card wb-pick" key={style.id} aria-pressed={spec.style.includes(style.id)} disabled={!spec.style.includes(style.id) && spec.style.length >= 2}
              data-testid={`style-${style.id}`} onClick={() => patch({ style: spec.style.includes(style.id) ? spec.style.filter(s => s !== style.id) : [...spec.style, style.id] })}>
              <span className="wb-tick" aria-hidden="true">{spec.style.includes(style.id) ? "✓" : ""}</span>
              <img src={artUrl(pieces[0]!, { style: style.id, wood: spec.wood, finish: spec.finish })} alt={`${categoryLabel(pieces[0]!, lang)} · ${style[lang]}`} />
              {pieces.length > 1 && <span style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(pieces.length - 1, 3)}, 1fr)`, gap: 6, marginBottom: 10 }}>
                {pieces.slice(1, 4).map(piece => <img key={piece} src={artUrl(piece, { style: style.id, wood: spec.wood, finish: spec.finish })} alt={categoryLabel(piece, lang)} style={{ margin: 0, borderRadius: 8 }} />)}
              </span>}
              <strong>{style[lang]}</strong>
            </button>;
          })}</div>
          <label>{t("صورة مرجعية (اختياري)", "Reference photo (optional)")}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || demo || (spec.referencePhotos?.length || 0) >= 5} onChange={e => upload(e.target.files?.[0])} /></label>
          {uploading && <p role="status">{t("جارٍ رفع الصورة…", "Uploading photo…")}</p>}
          {spec.referencePhotos?.map(url => <img key={url} src={url} alt={t("صورتك المرجعية", "Your reference photo")} width={100} />)}
        </>}
        {step === 2 && <>
          {catalogError && <div className="wb-error" role="alert"><p>{t("الكتالوج غير متاح حالياً. يمكنك إعادة المحاولة أو استخدام التوليد والنموذج الجاهز.", "Catalog unavailable. Retry or use generation and the prepared fallback.")}</p><button onClick={() => setCatalogVersion(value => value + 1)}>{t("إعادة تحميل الكتالوج", "Retry catalog")}</button></div>}
          {!catalog.length && !catalogError && <p role="status">{t("جارٍ تحميل الكتالوج…", "Loading catalog…")}</p>}
          <PieceStep spec={spec} patch={patch} catalog={catalog} lang={lang} />
        </>}
        {step === 3 && <div className="wb-columns">
          <section className="wb-card">
            {spec.pieceSource === "catalog" && <p className="wb-notice">{t("هذه مقاسات وخامات القطعة الجاهزة. لتغييرها ارجع واختر «عدّل قطعة».", "These are the catalog dimensions and materials. Go back and choose Customize to change them.")}</p>}
            <div className="wb-three">{(["w", "d", "h"] as const).map((key, index) => <label key={key}>{[t("العرض (سم)", "Width (cm)"), t("العمق (سم)", "Depth (cm)"), t("الارتفاع (سم)", "Height (cm)")][index]}
              <input type="number" inputMode="decimal" min={10} max={600} disabled={spec.pieceSource === "catalog"} value={spec.dimensions[key] || ""} onChange={e => patch({ dimensions: { ...spec.dimensions, [key]: Number(e.target.value) } })} /></label>)}</div>
            <div role="group" aria-label={t("الخشب", "Wood")}><p style={{ fontWeight: 650, marginBottom: 6 }}>{t("الخشب", "Wood")}</p>
              <div className="wb-swatches">{(item?.woods || ["oak", "beech", "walnut", "pine"]).map(value =>
                <button key={value} type="button" aria-pressed={spec.wood === value} disabled={spec.pieceSource === "catalog"} data-testid={`wood-${value}`} onClick={() => setMaterial({ wood: value })}>
                  <i style={{ background: swatch(value) }} />{label(WOOD_LABELS, value, lang)}</button>)}</div></div>
            <div role="group" aria-label={t("التشطيب", "Finish")}><p style={{ fontWeight: 650, margin: "16px 0 6px" }}>{t("التشطيب", "Finish")}</p>
              <div className="wb-swatches">{(item?.finishes || ["natural", "matte", "white", "walnut"]).map(value =>
                <button key={value} type="button" aria-pressed={spec.finish === value} disabled={spec.pieceSource === "catalog"} data-testid={`finish-${value}`} onClick={() => setMaterial({ finish: value })}>
                  <i style={{ background: swatch(spec.wood, value) }} />{label(FINISH_LABELS, value, lang)}</button>)}</div></div>
            <label>{t("ميزانية تقريبية بالجنيه المصري", "Approximate budget in EGP")}<select value={spec.budgetRange} onChange={e => patch({ budgetRange: e.target.value })}><option value="15000-30000">15,000–30,000 EGP</option><option value="30000-60000">30,000–60,000 EGP</option><option value="60000-100000">60,000–100,000 EGP</option><option value="100000+">100,000+ EGP</option></select></label>
            <label>{t("ملاحظات ومقاسات باقي القطع", "Notes & other pieces' dimensions")}<textarea maxLength={2000} value={spec.notes} onChange={e => patch({ notes: e.target.value })} /></label>
          </section>
          <div className="wb-stack">
            <figure className="wb-card" style={{ margin: 0 }}>
              <img data-testid="material-preview" src={spec.thumbnailUrl && !recolor(spec.thumbnailUrl, {}) ? spec.thumbnailUrl
                : artUrl(item?.category || spec.pieces?.[0] || "dresser", { style: spec.style[0], wood: spec.wood, finish: spec.finish })} alt="" />
              <figcaption className="wb-muted">{label(WOOD_LABELS, spec.wood, lang)} · {label(FINISH_LABELS, spec.finish, lang)}</figcaption>
            </figure>
            <Furniture3D model={spec} dimensions={spec.dimensions} baseDimensions={item?.defaultDims} lang={lang} />
          </div>
        </div>}
        {step === 4 && <section className="wb-card">
          <label>{t("دولة التوصيل", "Delivery country")}<select value={spec.deliveryCountry} onChange={e => patch({ deliveryCountry: e.target.value })}><option value="SA">{t("السعودية", "Saudi Arabia")}</option><option value="EG">{t("مصر", "Egypt")}</option><option value="AE">{t("الإمارات", "United Arab Emirates")}</option><option value="other">{t("دولة أخرى", "Other country")}</option></select></label>
          <label>{t("المدينة", "City")}<input autoComplete="address-level2" maxLength={100} value={spec.deliveryCity} onChange={e => patch({ deliveryCity: e.target.value })} /></label>
          <label>{t("الموعد المطلوب", "Wanted by")}<input type="date" min={today()} value={spec.wantedBy} onChange={e => patch({ wantedBy: e.target.value })} /></label>
          <p className="wb-muted">{t("تؤكد الورشة الموعد والشحن قبل إصدار السعر.", "The workshop will confirm timing and shipping before quoting.")}</p>
        </section>}
        {step === 5 && <section className="wb-card">
          <label>{t("الاسم", "Name")}<input autoComplete="name" maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
          <label>{t("رقم واتساب مع كود الدولة", "WhatsApp with country code")}<input type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="+966 5x xxx xxxx" value={phone} maxLength={20} onChange={e => setPhone(e.target.value)} /></label>
          <p>{t("لا يلزم حساب. سنعطيك رابطاً خاصاً لطلبك بعد الإرسال.", "No account required. You'll receive a private order link after submitting.")}</p>
          <p className="wb-muted">{t("الطلب لا يحصّل أي مبلغ. راجع التصميم والسعر قبل الدفع.", "Submitting does not charge you. Review the design and quote before paying.")}</p>
        </section>}
        {spec.pieceSource === "generated" && !spec.glbUrl && (step === 2 || generation.taskId || generation.failed) &&
          <GenerationPanel generation={generation} lang={lang} prompt={prompt} onPrompt={setPrompt} onKeep={keep} onFallback={selectFallback} />}
        {spec.pieceSource === "generated" && spec.glbUrl && <p className="wb-badge">{t("تم الاحتفاظ بالنموذج", "Model selected")}</p>}
        {step >= 3 && !demo && spec.glbUrl && <EstimatePreview spec={spec} lang={lang} />}
        {error && <p role="alert" className="wb-error">{error}</p>}
        <nav className="wb-actions" aria-label={t("خطوات الطلب", "Quiz navigation")}>
          <button disabled={step === 0 || busy} onClick={() => { setStep(s => s - 1); setError(""); }}>{t("السابق", "Back")}</button>
          {step < 5 ? <button className="wb-primary" disabled={uploading} onClick={() => { const invalid = validate(step); setError(invalid); if (!invalid) setStep(s => s + 1); }} data-testid="quiz-next">{t("التالي", "Next")}</button>
            : <button className="wb-primary" disabled={busy || uploading} onClick={submit} data-testid="quiz-submit">{busy ? t("جارٍ الإرسال…", "Submitting…") : t("أرسل الطلب", "Submit request")}</button>}
        </nav>
      </>}
      {success && error && <p role="alert" className="wb-error">{error}</p>}
    </main>
  </div>;
}
