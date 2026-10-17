import { useEffect, useState } from "react";
import { estimateFurniture, getHealthCheckQueryKey, useHealthCheck } from "@workspace/api-client-react";
import type { FurnitureEstimate as Estimate } from "@workspace/api-client-react";
import type { Language, Spec } from "./types";

// Paymob is configured server-side (Worker secrets); /api/healthz reports `paymob-test` / `paymob-live`.
// Undefined while loading so no notice flashes before the status is known.
export function usePaymentsConnected(): boolean | undefined {
  const { data, isError } = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 5 * 60_000, retry: 1 } });
  if (isError) return false;
  return data ? (data.payments?.startsWith("paymob-") ?? false) : undefined;
}

export function EstimateCard({ estimate, lang, saved = false }: { estimate: Estimate; lang: Language; saved?: boolean }) {
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;
  const paymentsConnected = usePaymentsConnected();
  const money = (value: number) => `${new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-GB", { maximumFractionDigits: 0 }).format(value)} ${t("ج.م", "EGP")}`;
  return <section className="wb-card" aria-label={t("التكلفة التقديرية", "Indicative estimate")} data-testid="furniture-estimate">
    <span className="wb-badge">{estimate.pricingVersion === "workshop-estimate" ? t("تقدير الورشة", "Workshop estimate") : t("تقدير تخطيطي مبدئي", "Indicative planning estimate")}</span>
    <h2>{money(estimate.totalEgp)}</h2>
    {estimate.lowEgp !== estimate.highEgp && <p className="wb-muted">{t("نطاق متوقع:", "Expected range:")} {money(estimate.lowEgp)} – {money(estimate.highEgp)}</p>}
    <dl className="wb-estimate-lines">{estimate.items.map(item => <div key={item.key}><dt>{lang === "ar" ? item.labelAr : item.label}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</dt><dd>{money(item.amountEgp)}</dd></div>)}</dl>
    <p><strong>{t("العربون التقديري", "Estimated deposit")} · {Math.round(estimate.depositPercent * 100)}%: {money(estimate.depositEgp)}</strong></p>
    <p className="wb-muted">{saved ? t("هذا التقدير محفوظ مع طلبك.", "This estimate is saved with your order.") : t("يُعاد حساب التقدير على الخادم عند إرسال الطلب.", "The estimate is recalculated on the server when you submit.")} {t("ليس عرض سعر ملزماً. تؤكد الورشة التصميم والسعر النهائي أولاً.", "This is not a binding quote. The workshop confirms the design and final price first.")}</p>
    {estimate.pricingVersion !== "workshop-estimate" && <p className="wb-muted">{t("يعتمد على معدلات تخطيطية استرشادية، وليست أسعاراً معتمدة من الورشة أو الموردين.", "Based on illustrative planning rates, not approved workshop or supplier prices.")}</p>}
    <p className="wb-muted">{t("لا يشمل التوصيل والتركيب والضرائب والمراتب والإكسسوارات. راجع هذه البنود مع الورشة قبل قبول السعر النهائي.", "Excludes delivery, installation, taxes, mattresses and accessories. Confirm these with the workshop before accepting the final quote.")}</p>
    {paymentsConnected === false && <p className="wb-notice">{t("ربط Paymob قيد الانتظار. لن يتم تحصيل عربون أو تأكيد دفع في هذه المرحلة.", "Paymob setup is pending. No deposit will be collected or marked paid at this stage.")}</p>}
    {paymentsConnected && <p className="wb-notice">{t("يُدفع العربون بأمان عبر Paymob بعد أن تؤكد الورشة السعر النهائي.", "The deposit is paid securely through Paymob after the workshop confirms the final quote.")}</p>}
  </section>;
}

export function EstimatePreview({ spec, lang }: { spec: Spec; lang: Language }) {
  const [state, setState] = useState<{ key: string; estimate?: Estimate; failed?: boolean }>({ key: "" });
  const [retry, setRetry] = useState(0);
  // Only pricing inputs affect a preview; contacts/prompt/upload URLs never leave
  // the browser for this calculation and changes cannot show an older response.
  const input = JSON.stringify({ productType: spec.productType, pieceSource: spec.pieceSource,
    catalogItemId: spec.catalogItemId, dimensions: spec.dimensions, wood: spec.wood,
    finish: spec.finish, bedroomPieces: spec.bedroomPieces });
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      estimateFurniture({ spec: JSON.parse(input) }, { signal: controller.signal })
        .then(estimate => { if (!controller.signal.aborted) setState({ key: input, estimate }); })
        .catch(() => { if (!controller.signal.aborted) setState({ key: input, failed: true }); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [input, retry]);
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;
  if (state.key === input && state.estimate) return <EstimateCard estimate={state.estimate} lang={lang} />;
  if (state.key === input && state.failed) return <section className="wb-card" role="status">
    <h2>{t("التقدير غير متاح حالياً", "Estimate unavailable right now")}</h2>
    <p>{t("يمكنك إرسال الطلب للمراجعة دون تقدير؛ لا يوجد أي دفع الآن.", "You can submit for workshop review without an estimate; no payment is due now.")}</p>
    <button type="button" onClick={() => { setState({ key: "" }); setRetry(value => value + 1); }}>{t("أعد حساب التقدير", "Retry estimate")}</button>
  </section>;
  return <section className="wb-card" role="status" aria-live="polite">{t("جارٍ حساب التكلفة التقديرية…", "Calculating your indicative estimate…")}</section>;
}
