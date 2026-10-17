import { createElement, useEffect, useRef, useState } from "react";
import type { Dimensions, Language, Model } from "../quiz/types";

// React adapter for the supplied Furniture3D model-viewer reference.
// Keep all quiz/buyer model and AR behavior in this component.
let runtime: Promise<void> | undefined;
function loadViewer() {
  if (customElements.get("model-viewer")) return Promise.resolve();
  if (!runtime) {
    runtime = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "module";
      script.src = "https://unpkg.com/@google/model-viewer@4.1.0/dist/model-viewer.min.js";
      script.onload = () => { customElements.whenDefined("model-viewer").then(() => resolve()); };
      script.onerror = () => { script.remove(); runtime = undefined; reject(new Error("viewer unavailable")); };
      document.head.appendChild(script);
    });
  }
  return runtime;
}

type Viewer = HTMLElement & { canActivateAR?: boolean };
export default function Furniture3D({ model, dimensions, baseDimensions, lang = "ar" }: {
  model: Model; dimensions?: Dimensions; baseDimensions?: Dimensions; lang?: Language;
}) {
  const ref = useRef<Viewer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [canAR, setCanAR] = useState(false);
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;
  const scaled = !!(dimensions && baseDimensions);
  const scale = dimensions && baseDimensions
    ? `${dimensions.w / baseDimensions.w} ${dimensions.h / baseDimensions.h} ${dimensions.d / baseDimensions.d}` : "1 1 1";

  useEffect(() => {
    setState("loading"); setCanAR(false);
    let active = true;
    loadViewer().catch(() => { if (active) setState("error"); });
    const viewer = ref.current;
    const loaded = () => { setState("ready"); setCanAR(!!viewer?.canActivateAR); };
    const failed = () => setState("error");
    viewer?.addEventListener("load", loaded);
    viewer?.addEventListener("error", failed);
    return () => { active = false; viewer?.removeEventListener("load", loaded); viewer?.removeEventListener("error", failed); };
  }, [model.glbUrl]);

  if (!model.glbUrl) return null;
  return <section className="w3d" aria-label={t("معاينة ثلاثية الأبعاد", "Interactive 3D preview")}>
    {createElement("model-viewer", {
      ref, src: model.glbUrl,
      // Quick Look must use the transformed model, not the unscaled catalog USDZ.
      "ios-src": scaled ? undefined : model.usdzUrl,
      poster: model.thumbnailUrl, alt: t("تصميم الأثاث: اسحب للتدوير وكبّر للتفاصيل", "Furniture design: drag to rotate and zoom"),
      "camera-controls": true, "touch-action": "pan-y", ar: true,
      "ar-modes": "webxr scene-viewer quick-look", "ar-placement": "floor", "ar-scale": "fixed",
      scale, "shadow-intensity": "1", "camera-orbit": "35deg 65deg auto",
      style: { width: "100%", height: "340px" },
    }, <button className="wb-primary" slot="ar-button">{t("شاهدها في غرفتك", "View in your room")}</button>)}
    <p role="status">{state === "loading" ? t("جارٍ تحميل النموذج…", "Loading model…")
      : state === "error" ? t("تعذّر تحميل المعاينة. اختياراتك محفوظة، ويمكنك المتابعة.", "Preview unavailable. Your choices are saved; you can continue.")
      : t("اسحب للتدوير • قرّب للتفاصيل", "Drag to rotate • Pinch to zoom")}</p>
    {state === "ready" && !canAR && <p>{t("للواقع المعزز، افتح هذا الرابط على هاتفك في Safari أو Chrome.", "For AR, open this link on your phone in Safari or Chrome.")}</p>}
    {scaled && <small>{t("المعاينة تعكس المقاس ولون الخشب والتشطيب.", "The preview reflects the size, wood colour and finish.")}</small>}
  </section>;
}
