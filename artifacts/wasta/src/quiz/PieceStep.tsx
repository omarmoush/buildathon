import Furniture3D from "../buyer/Furniture3D";
import type { CatalogItem, Language, Spec } from "./types";
import type { useFurnitureGeneration } from "./useFurnitureGeneration";

export function GenerationPanel({ generation, lang, onKeep, onFallback, onPrompt, prompt }: {
  generation: ReturnType<typeof useFurnitureGeneration>; lang: Language;
  onKeep: () => void; onFallback: () => void; prompt: string; onPrompt: (value: string) => void;
}) {
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;
  return <section className="wb-card wb-stack">
    <h2>{t("صمّم قطعة جديدة", "Generate a new piece")}</h2>
    <label>{t("صف قطعة الأثاث", "Describe your furniture")}
      <textarea data-testid="generation-prompt" maxLength={800} value={prompt} onChange={e => onPrompt(e.target.value)}
        placeholder={t("سرير بلوط مزدوج، مسند منحني، طراز ياباني بسيط", "Double oak bed, curved headboard, minimal Japanese style")} />
    </label>
    <p className="wb-muted">{t("قد يستغرق التوليد دقائق. تابع باقي الخطوات أثناء الانتظار. النموذج معاينة للشكل، وليس رسماً هندسياً.", "Generation can take several minutes. Continue the quiz while it runs. This is a shape preview, not an engineering drawing.")}</p>
    {!generation.pending && <button className="wb-primary" disabled={!prompt.trim()} onClick={() => generation.generate(prompt.trim())} data-testid="generate-model">
      {t("توليد النموذج", "Generate model")}
    </button>}
    {generation.pending && <div role="status"><p>{t("جارٍ التوليد…", "Generating…")} {generation.result?.progress || 0}%</p>
      <progress max={100} value={generation.result?.progress || 0} aria-label={t("تقدم التوليد", "Generation progress")} /></div>}
    {generation.result?.demo && <p className="wb-notice">{t("وضع تجريبي: هذا نموذج جاهز، وليس نتيجة مولّدة من وصفك.", "Demo mode: this is a prepared model, not a model generated from your prompt.")}</p>}
    {generation.result?.status === "done" && generation.result.glbUrl && <>
      <Furniture3D model={generation.result} lang={lang} />
      <div className="wb-row">
        <button className="wb-primary" onClick={onKeep} data-testid="keep-model">{t("احتفظ بهذه القطعة", "Keep this piece")}</button>
        <button onClick={generation.clear}>{t("جرّب مرة أخرى", "Try again")}</button>
      </div>
    </>}
    {(generation.slow || generation.failed) && <p role="status" className="wb-notice">{t("التوليد بطيء أو غير متاح. اختر النموذج الجاهز لإكمال طلبك.", "Generation is slow or unavailable. Use the prepared model to continue.")}</p>}
    <button onClick={onFallback} data-testid="use-fallback">{t("استخدم نموذج السرير الجاهز", "Use the prepared bed model")}</button>
  </section>;
}

export default function PieceStep({ spec, patch, catalog, lang }: {
  spec: Spec; patch: (value: Partial<Spec>) => void; catalog: CatalogItem[]; lang: Language;
}) {
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;
  const select = (item: CatalogItem) => patch({
    catalogItemId: item.id, glbUrl: item.glbUrl, usdzUrl: item.usdzUrl, thumbnailUrl: item.thumbnailUrl,
    dimensions: { ...item.defaultDims }, wood: item.woods[0], finish: item.finishes[0],
    prompt: undefined, generationTaskId: undefined,
  });
  return <div className="wb-stack">
    <div className="wb-grid">
      {([
        ["catalog", t("استخدم كما هي", "Use as is"), t("اختر قطعة جاهزة من الكتالوج", "Choose a ready catalog piece")],
        ["customized", t("عدّل قطعة", "Customize"), t("اختر ثم غيّر الحجم والخامة", "Choose, then adjust size and materials")],
        ["generated", t("ولّد قطعة جديدة", "Generate new"), t("حوّل وصفك إلى نموذج ثلاثي الأبعاد", "Turn your prompt into a 3D model")],
      ] as const).map(([source, title, subtitle]) => <button key={source} className="wb-card" aria-pressed={spec.pieceSource === source}
        onClick={() => { if (spec.pieceSource !== source) patch({ pieceSource: source, catalogItemId: undefined, glbUrl: undefined, usdzUrl: undefined, thumbnailUrl: undefined, prompt: undefined, generationTaskId: undefined }); }}>
        <strong>{title}</strong><small>{subtitle}</small>
      </button>)}
    </div>
    {spec.pieceSource !== "generated" && <div className="wb-grid" aria-label={t("كتالوج القطع", "Furniture catalog")}>
      {catalog.map(item => <button className="wb-card" key={item.id} aria-pressed={spec.catalogItemId === item.id} onClick={() => select(item)}>
        {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" loading="lazy" />}
        <strong>{lang === "ar" ? item.nameAr || item.name : item.name}</strong><small dir="ltr">{item.defaultDims.w} × {item.defaultDims.d} × {item.defaultDims.h} cm</small>
      </button>)}
    </div>}
    {spec.pieceSource !== "generated" && spec.glbUrl && <Furniture3D model={spec} dimensions={spec.dimensions}
      baseDimensions={catalog.find(item => item.id === spec.catalogItemId)?.defaultDims} lang={lang} />}
  </div>;
}
