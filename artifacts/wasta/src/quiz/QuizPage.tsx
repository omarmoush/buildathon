import { useEffect, useRef, useState } from "react";
import { api, ApiError, openPaymobCheckout } from "./api";
import { demoCatalog, demoOrder, initialSpec } from "./demo";
import PieceStep, { GenerationPanel } from "./PieceStep";
import { useFurnitureGeneration } from "./useFurnitureGeneration";
import Furniture3D from "../buyer/Furniture3D";
import { EstimateCard, EstimatePreview, usePaymentsConnected } from "./EstimateCard";
import type { FurnitureEstimate } from "@workspace/api-client-react";
import { Link } from "wouter";
import type { CatalogItem, Language, Spec } from "./types";
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
    return { ...initialSpec, dimensions: { ...initialSpec.dimensions }, style: [...initialSpec.style],
      productType: product && ["bedroom-set", "wardrobe", "dining-set", "living-room", "other"].includes(product) ? product : initialSpec.productType,
      pieceSource: source === "customized" || source === "generated" ? source : "catalog",
      bedroomPieces: product && product !== "bedroom-set" ? undefined : [...(initialSpec.bedroomPieces || [])],
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
  const [success, setSuccess] = useState<{ orderId: string; token: string; estimate?: FurnitureEstimate | null }>();
  const [copied, setCopied] = useState(false);
  const submitting = useRef(false);
  const generation = useFurnitureGeneration();
  const paymentsConnected = usePaymentsConnected();
  const patch = (values: Partial<Spec>) => setSpec(old => ({ ...old, ...values }));
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = [
    t("نوع الأثاث", "Product type"), t("الطراز", "Style"), t("اختيار القطعة", "Your piece"),
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
      setSpec(old => ({ ...old, catalogItemId: selected.id, glbUrl: selected.glbUrl, usdzUrl: selected.usdzUrl,
        thumbnailUrl: selected.thumbnailUrl, dimensions: { ...selected.defaultDims }, wood: selected.woods[0], finish: selected.finishes[0] }));
    }
  }, [catalog, entry]);
  useEffect(() => { localStorage.setItem("wasta-lang", lang); }, [lang]);
  useEffect(() => { heading.current?.focus(); }, [step, success]);
  const item = catalog.find(item => item.id === spec.catalogItemId);
  const selectFallback = () => {
    const fallback = catalog.find(item => item.id === "bed-oak") || demoCatalog[0];
    generation.clear();
    patch({ pieceSource: "catalog", catalogItemId: fallback.id, glbUrl: fallback.glbUrl,
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
    if (index === 0 && spec.productType === "bedroom-set" && !spec.bedroomPieces?.length) return t("اختر قطعة واحدة على الأقل.", "Choose at least one bedroom piece.");
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
        const result = await api<{ orderId: string; token: string; estimate?: FurnitureEstimate | null }>("/api/orders", {
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
  async function payDeposit() {
    if (!success || demo || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const result = await api<{ checkoutUrl?: string }>(`/api/b/${encodeURIComponent(success.token)}/pay`, { type: "deposit" });
      openPaymobCheckout(result.checkoutUrl);
    } catch {
      setError(t("تعذّر فتح صفحة الدفع. لم يتم تحصيل أي مبلغ. يمكنك الدفع لاحقاً من رابط طلبك.", "Could not open Paymob checkout. Nothing was charged. You can pay later from your order link."));
      submitting.current = false; setBusy(false);
    }
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
    <header><Link href="/" className="wb-link"><strong>{t("وسطى", "Wasta")}</strong></Link><span>{t("ورشة رضا • دمياط", "Reda's workshop • Damietta")}</span>
      <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label={t("Switch to English", "التبديل للعربية")}>{lang === "ar" ? "English" : "العربية"}</button></header>
    <main>
      {demo && <p className="wb-notice">{t("عرض تجريبي فقط — لا يُرسل طلباً حقيقياً ولا يحصّل أموالاً.", "Demo only — no real order is submitted and no money is collected.")}</p>}
      {success ? <section className="wb-card">
        <span className="wb-badge">{t("تم استلام الطلب", "Request received")}</span>
        <h1 ref={heading} tabIndex={-1}>{t("احتفظ برابط طلبك", "Keep your private order link")}</h1>
        <p>{t("راجع التصميم والسعر وتابع التصنيع من هذا الرابط دون إنشاء حساب. لا تشاركه إلا مع من تثق به.", "Review the design and quote and follow production without an account. Share this private link only with people you trust.")}</p>
        {success.estimate && <EstimateCard estimate={success.estimate} lang={lang} saved />}
        {paymentsConnected && !demo && success.estimate && success.estimate.depositEgp > 0 &&
          <button className="wb-primary" disabled={busy} onClick={payDeposit} data-testid="quiz-pay-deposit">{t("ادفع العربون عبر Paymob", "Pay deposit with Paymob")}</button>}
        {error && <p role="alert" className="wb-error">{error}</p>}
        <p className="wb-notice">{paymentsConnected
          ? t("ادفع العربون عبر Paymob لتأكيد طلبك. يمكنك أيضاً الدفع لاحقاً من رابط طلبك الخاص.", "Pay the deposit through Paymob to confirm your request. You can also pay later from your private order link.")
          : t("طلبك ينتظر مراجعة الورشة. ربط Paymob قيد الانتظار، ولا يوجد أي مبلغ محصّل أو مستحق الدفع الآن.", "Your request is awaiting workshop review. Paymob setup is pending; no money was collected or is payable now.")}</p>
        <a className="wb-link wb-primary" href={magicLink}>{t("افتح طلبك", "Open your order")}</a>
        <label>{t("رابط الطلب الخاص", "Private order link")}<input readOnly value={magicLink} dir="ltr" onFocus={e => e.target.select()} /></label>
        <button onClick={() => navigator.clipboard.writeText(magicLink).then(() => setCopied(true)).catch(() => setError(t("انسخ الرابط من الحقل أعلاه.", "Copy the link from the field above.")))}>{copied ? t("تم النسخ", "Copied") : t("نسخ الرابط", "Copy link")}</button>
      </section> : <>
        <p className="wb-muted">{t("أثاث مصنوع لك، خطوة بخطوة", "Furniture made for you, step by step")}</p>
        <p>{t("الخطوة", "Step")} {step + 1} / 6</p>
        <progress max={6} value={step + 1} aria-label={t("تقدم الطلب", "Quiz progress")} />
        <h1 ref={heading} tabIndex={-1}>{steps[step]}</h1>
        {step === 0 && <div className="wb-stack">
          <div className="wb-grid">{[["bedroom-set", t("غرفة نوم", "Bedroom set")], ["dining-set", t("غرفة سفرة", "Dining set")], ["wardrobe", t("دولاب", "Wardrobe")], ["living-room", t("غرفة معيشة", "Living room")], ["other", t("قطعة أخرى", "Other")]].map(([value, label]) =>
            <button className="wb-card" key={value} aria-pressed={spec.productType === value} onClick={() => { if (spec.productType !== value) patch({ productType: value, bedroomPieces: value === "bedroom-set" ? ["bed", "nightstands", "wardrobe", "dresser"] : undefined, catalogItemId: undefined, glbUrl: undefined, usdzUrl: undefined, thumbnailUrl: undefined, generationTaskId: undefined, prompt: undefined }); }}><strong>{label}</strong></button>)}</div>
          {spec.productType === "bedroom-set" && <section className="wb-card"><h2>{t("محتويات غرفة النوم", "Your bedroom set")}</h2>
            <p>{t("اختر القطع المطلوبة. المقاسات والنموذج في الخطوات التالية تخص القطعة الرئيسية؛ اكتب تفاصيل باقي القطع في الملاحظات.", "Choose included pieces. The next steps size and preview the main piece; add other pieces' dimensions in notes.")}</p>
            {[["bed", t("سرير مزدوج", "Double bed")], ["nightstands", t("٢ كومودينو", "2 nightstands")], ["wardrobe", t("دولاب ملابس", "Wardrobe")], ["dresser", t("تسريحة", "Dresser")]].map(([value, label]) =>
              <label key={value} className="wb-check"><input type="checkbox" checked={spec.bedroomPieces?.includes(value) || false}
                onChange={() => patch({ bedroomPieces: spec.bedroomPieces?.includes(value) ? spec.bedroomPieces.filter(p => p !== value) : [...(spec.bedroomPieces || []), value] })} />{label}</label>)}</section>}
        </div>}
        {step === 1 && <>
          <p>{t("اختر طرازاً واحداً أو اثنين", "Pick up to two styles")}</p>
          <div className="wb-grid">{[["modern", t("مودرن", "Modern"), "photo-1616486338812-3dadae4b4ace"], ["classic", t("كلاسيك", "Classic"), "photo-1615874959474-d609969a20ed"], ["japandi", t("ياباني بسيط", "Japandi"), "photo-1617325247661-675ab4b64ae2"], ["scandinavian", t("اسكندنافي", "Scandinavian"), "photo-1616486029423-aaa4789e8c9a"]].map(([value, label, photo]) =>
            <button className="wb-card" key={value} aria-pressed={spec.style.includes(value)} disabled={!spec.style.includes(value) && spec.style.length >= 2}
              onClick={() => patch({ style: spec.style.includes(value) ? spec.style.filter(s => s !== value) : [...spec.style, value] })}>
              <img src={`https://images.unsplash.com/${photo}?auto=format&fit=crop&w=500&q=70`} alt="" /><strong>{label}</strong>
            </button>)}</div>
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
            <label>{t("الخشب", "Wood")}<select disabled={spec.pieceSource === "catalog"} value={spec.wood} onChange={e => patch({ wood: e.target.value })}>{(item?.woods || ["oak", "beech", "walnut", "pine"]).map(value => <option key={value} value={value}>{({ oak: t("بلوط", "Oak"), beech: t("زان", "Beech"), walnut: t("جوز", "Walnut"), pine: t("صنوبر", "Pine") } as Record<string, string>)[value] || value}</option>)}</select></label>
            <label>{t("التشطيب", "Finish")}<select disabled={spec.pieceSource === "catalog"} value={spec.finish} onChange={e => patch({ finish: e.target.value })}>{(item?.finishes || ["natural", "matte", "white", "walnut"]).map(value => <option key={value} value={value}>{({ natural: t("طبيعي", "Natural"), matte: t("مطفي", "Matte"), white: t("أبيض", "White"), walnut: t("لون الجوز", "Walnut stain") } as Record<string, string>)[value] || value}</option>)}</select></label>
            <label>{t("ميزانية تقريبية بالجنيه المصري", "Approximate budget in EGP")}<select value={spec.budgetRange} onChange={e => patch({ budgetRange: e.target.value })}><option value="15000-30000">15,000–30,000 EGP</option><option value="30000-60000">30,000–60,000 EGP</option><option value="60000-100000">60,000–100,000 EGP</option><option value="100000+">100,000+ EGP</option></select></label>
            <label>{t("ملاحظات ومقاسات باقي القطع", "Notes & other pieces' dimensions")}<textarea maxLength={2000} value={spec.notes} onChange={e => patch({ notes: e.target.value })} /></label>
          </section>
          <Furniture3D model={spec} dimensions={spec.dimensions} baseDimensions={item?.defaultDims} lang={lang} />
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
