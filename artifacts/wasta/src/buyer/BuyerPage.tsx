import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import Furniture3D from "./Furniture3D";
import { api, ApiError } from "../quiz/api";
import { demoCatalog, demoOrder } from "../quiz/demo";
import type { BuyerOrder, Language } from "../quiz/types";
import "../quiz/buyer.css";

export default function BuyerPage({ token: suppliedToken }: { token?: string }) {
  const params = useParams<{ token: string }>();
  const token = suppliedToken || params.token || "";
  const base = `/api/b/${encodeURIComponent(token)}`;
  const demo = token === "demo-person2" && new URLSearchParams(location.search).get("demo") === "1";
  const [lang, setLang] = useState<Language>("ar");
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;
  const [order, setOrder] = useState<BuyerOrder>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [comment, setComment] = useState("");
  const [deliveryConfirm, setDeliveryConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const mutation = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const data = await api<BuyerOrder>(base, undefined, signal);
    if (!data.id || !data.spec || !Array.isArray(data.updates) || !Array.isArray(data.payments)) throw new Error("Contract mismatch");
    setOrder(data);
  }, [base]);
  useEffect(() => {
    if (demo) {
      try { setOrder(JSON.parse(sessionStorage.getItem("wasta-demo-order") || "null") || demoOrder()); }
      catch { setOrder(demoOrder()); }
      return;
    }
    const controller = new AbortController();
    setOrder(undefined); setError("");
    refresh(controller.signal).catch(err => {
      if (!controller.signal.aborted) setError(err instanceof ApiError && err.status === 404
        ? t("الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً من الورشة.", "This link is invalid or expired. Ask the workshop for a new link.")
        : t("تعذّر تحميل الطلب. تأكد أن مسار المشتري موصول ثم حاول مجدداً.", "Could not load this order. Ensure the buyer endpoint is wired and retry."));
    });
    return () => controller.abort();
    // Language changes should not erase a currently loaded order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, refresh, loadVersion]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !mutation.current) {
        refresh(controller.signal).catch(() => setNotice(t("تعذّر تحديث الحالة؛ قد تكون البيانات قديمة.", "Status refresh failed; details may be out of date.")));
      }
    }, 15_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [demo, refresh, lang]);
  const money = (amount: number, currency = "EGP") => new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  const statusText: Record<string, string> = {
    requested: t("تم استلام الطلب", "Request received"), design_review: t("مراجعة التصميم", "Design review"),
    quoted: t("عرض السعر جاهز", "Quote ready"), deposit_paid: t("تم دفع العربون", "Deposit paid"),
    in_production: t("جارٍ التصنيع", "In production"), ready: t("جاهز للتسليم", "Ready for delivery"),
    delivered: t("تم التسليم", "Delivered"), closed: t("اكتمل الطلب", "Order complete"),
    cancelled: t("ملغي", "Cancelled"), expired: t("منتهي الصلاحية", "Expired"),
  };
  const labels: Record<string, string> = {
    "bedroom-set": t("غرفة نوم", "Bedroom set"), "dining-set": t("غرفة سفرة", "Dining set"),
    wardrobe: t("دولاب", "Wardrobe"), "living-room": t("غرفة معيشة", "Living room"), other: t("أثاث آخر", "Other furniture"),
    bed: t("سرير", "Bed"), nightstands: t("٢ كومودينو", "2 nightstands"), dresser: t("تسريحة", "Dresser"),
    oak: t("بلوط", "Oak"), beech: t("زان", "Beech"), walnut: t("جوز", "Walnut"), pine: t("صنوبر", "Pine"),
    natural: t("طبيعي", "Natural"), matte: t("مطفي", "Matte"), white: t("أبيض", "White"),
    modern: t("مودرن", "Modern"), classic: t("كلاسيك", "Classic"), japandi: t("ياباني بسيط", "Japandi"), scandinavian: t("اسكندنافي", "Scandinavian"),
    cutting: t("التقطيع", "Cutting"), assembly: t("التجميع", "Assembly"), finishing: t("التشطيب", "Finishing"),
    held: t("محتجز حتى التسليم", "Held until delivery"), released: t("تم التحويل", "Released"), pending: t("قيد المعالجة", "Pending"),
  };
  function demoAction(action: string) {
    setOrder(current => {
      if (!current) return current;
      const next = { ...current };
      if (action === "approve-design") { next.designApproved = true; setNotice(t("تم اعتماد التصميم التجريبي.", "Demo design approved.")); }
      if (action === "request-changes") { next.designApproved = false; setNotice(t("تم حفظ التعديل التجريبي.", "Demo change request saved.")); }
      if (action === "pay") {
        next.status = "deposit_paid";
        next.payments = [{ id: "demo-deposit", type: "deposit", amountEgp: current.quote?.depositEgp || 0, state: "held" }];
      }
      if (action === "confirm-delivery") {
        next.status = "closed";
        next.payments = [...current.payments.map(p => ({ ...p, state: "released" })), { id: "demo-balance", type: "balance", amountEgp: (current.quote?.totalEgp || 0) - (current.quote?.depositEgp || 0), state: "released" }];
        setDeliveryConfirm(false);
      }
      sessionStorage.setItem("wasta-demo-order", JSON.stringify(next));
      return next;
    });
  }
  async function action(path: string, body: unknown = {}) {
    if (mutation.current) return;
    mutation.current = true; setPending(true); setError(""); setNotice("");
    try {
      if (demo) { demoAction(path); return; }
      const result = await api<{ checkoutUrl?: string }>(`${base}/${path}`, body);
      if (path === "pay" || result.checkoutUrl) {
        if (!result.checkoutUrl) throw new Error("Missing checkout URL");
        const target = new URL(result.checkoutUrl);
        const host = target.hostname;
        if (target.protocol !== "https:" || target.username || target.password ||
          !(host === "paymob.com" || host.endsWith(".paymob.com") || host === "paymobsolutions.com" || host.endsWith(".paymobsolutions.com"))) throw new Error("Unexpected checkout URL");
        window.location.assign(target.href);
        return;
      }
      setNotice(t("تم إرسال الإجراء. نحدّث حالة الطلب…", "Action submitted. Refreshing order status…"));
      setDeliveryConfirm(false);
      try { await refresh(); } catch { setNotice(t("تم إرسال الإجراء، لكن تعذّر تحديث الحالة. أعد التحميل قبل تكراره.", "Action submitted, but status refresh failed. Reload before repeating it.")); }
    } catch (err) {
      setError(err instanceof ApiError && (err.code === "PAYMENTS_UNAVAILABLE" || err.status === 503)
        ? t("الدفع الإلكتروني غير متصل حالياً. لم يتم تحصيل أي مبلغ أو تغيير حالة الدفع. تواصل مع الورشة.", "Online payments are not connected. No amount was collected and no payment state was changed. Contact the workshop.")
        : t("لم يتم تأكيد الإجراء. أعد تحميل الحالة قبل المحاولة مجدداً. لا تعتبر العودة من صفحة الدفع تأكيداً للتحصيل.", "The action was not confirmed. Reload the status before retrying. Returning from checkout is not proof of payment."));
    } finally { mutation.current = false; setPending(false); }
  }
  const quote = order?.quote;
  const paymentsUnavailable = !demo && order?.paymentMode === "unavailable";
  const validQuote = quote && Number.isFinite(quote.fxRate) && quote.fxRate > 0
    && Number.isFinite(quote.depositEgp) && quote.depositEgp >= 0 && quote.depositEgp <= quote.totalEgp;
  const quoteExpired = !quote || !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= now;
  const stageOrder = ["requested", "design_review", "quoted", "deposit_paid", "in_production", "ready", "delivered", "closed"];
  return <div className="wb" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
    <header><strong>{t("وسطى", "Wasta")}</strong><span>{t("طلبك الخاص", "Your private order")}</span><button onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang === "ar" ? "English" : "العربية"}</button></header>
    <main>
      {demo && <section className="wb-notice"><p>{t("عرض تجريبي: لا توجد دفعات أو طلبات حقيقية.", "Demo: no real payments or orders.")}</p>
        <label>{t("معاينة مرحلة", "Preview a stage")}<select value={order?.status || "requested"} onChange={e => setOrder(current => {
          if (!current) return current;
          return { ...current, quote: current.quote || demoOrder().quote, status: e.target.value,
            designApproved: !["requested", "design_review"].includes(e.target.value),
            updates: ["in_production", "ready", "closed"].includes(e.target.value) ? [
              { stage: "cutting", note: t("تم تجهيز الخشب.", "Wood prepared.") }, { stage: "assembly", note: t("جارٍ تجميع القطع.", "Pieces are being assembled.") },
            ] : [],
          };
        })}>{stageOrder.map(value => <option key={value} value={value}>{statusText[value]}</option>)}</select></label></section>}
      {error && <div role="alert" className="wb-error"><p>{error}</p><button disabled={pending} onClick={() => { setError(""); setLoadVersion(v => v + 1); }}>{t("إعادة تحميل الحالة", "Reload status")}</button></div>}
      {notice && <p className="wb-notice" role="status">{notice}</p>}
      {!order && !error && <p role="status">{t("جارٍ تحميل طلبك…", "Loading your order…")}</p>}
      {order && <>
        <h1>{t("أهلاً", "Hello")}, {order.buyerName}</h1>
        <span className="wb-badge" data-testid="buyer-status">{statusText[order.status] || order.status}</span>
        <p className="wb-muted">{t("احتفظ بهذا الرابط؛ من يملكه يمكنه الوصول إلى طلبك.", "Keep this link private; anyone who has it can access your order.")}</p>
        <div className="wb-columns">
          <section className="wb-stack">
            <Furniture3D model={order.spec} lang={lang} dimensions={order.spec.dimensions}
              baseDimensions={order.spec.pieceSource === "customized" ? demoCatalog.find(item => item.id === order.spec.catalogItemId)?.defaultDims : undefined} />
            {order.images?.some(image => image.kind === "design") && <section className="wb-card">
              <h2>{t("تصاميم الورشة للمراجعة", "Workshop designs for review")}</h2>
              <p className="wb-muted">{t("راجع أحدث الصور قبل الموافقة؛ النموذج الثلاثي الأبعاد هو القطعة التي اخترتها في الطلب.", "Review the latest images before approving; the 3D model is the piece selected in your request.")}</p>
              <div className="wb-grid">{order.images.filter(image => image.kind === "design").slice().reverse().map((image, index) =>
                <a key={image.id || index} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={t("تصميم الورشة", "Workshop design")} loading="lazy" style={{ width: "100%", borderRadius: 12 }} /></a>)}</div>
            </section>}
            <section className="wb-card"><h2>{t("مواصفات التصميم", "Design specification")}</h2>
              <dl>
                <dt>{t("المنتج", "Product")}</dt><dd>{labels[order.spec.productType] || order.spec.productType}</dd>
                <dt>{t("الطراز", "Style")}</dt><dd>{order.spec.style.map(s => labels[s] || s).join("، ")}</dd>
                <dt>{t("الأبعاد (سم)", "Dimensions (cm)")}</dt><dd dir="ltr">{order.spec.dimensions.w} × {order.spec.dimensions.d} × {order.spec.dimensions.h}</dd>
                <dt>{t("الخشب", "Wood")}</dt><dd>{labels[order.spec.wood] || order.spec.wood}</dd>
                <dt>{t("التشطيب", "Finish")}</dt><dd>{labels[order.spec.finish] || order.spec.finish}</dd>
                <dt>{t("التوصيل", "Delivery")}</dt><dd>{order.spec.deliveryCity}, {order.spec.deliveryCountry}</dd>
                <dt>{t("الموعد المطلوب", "Wanted by")}</dt><dd>{order.spec.wantedBy || "—"}</dd>
              </dl>
              {order.spec.bedroomPieces?.length ? <p>{order.spec.bedroomPieces.map(piece => labels[piece] || piece).join(" • ")}</p> : null}
              {order.spec.notes && <p>{order.spec.notes}</p>}
            </section>
            {order.status === "requested" && <p className="wb-notice">{t("استلمت الورشة طلبك. ستراجع التفاصيل وترسل التصميم للموافقة.", "The workshop received your request and will share the design for approval.")}</p>}
            {order.status === "design_review" && <section className="wb-card"><h2>{t("راجع التصميم", "Review the design")}</h2>
              {order.designChangeNote && <p className="wb-notice">{t("التعديلات التي طلبتها:", "Your requested changes:")} {order.designChangeNote}</p>}
              {order.designApproved ? <p className="wb-badge">{t("اعتمدت التصميم. ننتظر عرض سعر الورشة.", "Design approved. Waiting for the workshop's quote.")}</p> : <>
                <button className="wb-primary" disabled={pending} onClick={() => action("approve-design")} data-testid="approve-design">{t("موافق على التصميم", "Approve design")}</button>
                <label>{t("التعديلات المطلوبة", "Requested changes")}<textarea maxLength={2000} value={comment} onChange={e => setComment(e.target.value)} /></label>
                <button disabled={pending || !comment.trim()} onClick={() => action("request-changes", { comment: comment.trim() })}>{t("طلب تعديلات", "Request changes")}</button>
              </>}
            </section>}
            {["deposit_paid", "in_production", "ready", "delivered", "closed"].includes(order.status) && <section className="wb-card">
              {order.payments.some(p => p.type === "deposit" && p.state === "held") && <p className="wb-badge">{t("العربون مسجّل كمحتجز حتى التسليم", "Deposit recorded as held until delivery")}</p>}
              <h2>{t("تقدم التصنيع", "Production progress")}</h2>
              {order.updates.length ? <ol className="wb-timeline">{order.updates.map((update, index) => <li key={update.id || index}>
                <strong>{labels[update.stage] || statusText[update.stage] || update.stage}</strong><p>{update.note}</p>
                {update.createdAt && <time dateTime={update.createdAt}>{new Date(update.createdAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en")}</time>}
                {update.photoUrl && <img src={update.photoUrl} alt={t("صورة من الورشة", "Workshop progress photo")} loading="lazy" />}
              </li>)}</ol> : <p>{t("ستظهر تحديثات الورشة هنا.", "Workshop updates will appear here.")}</p>}
            </section>}
            {order.status === "ready" && <section className="wb-card"><h2>{t("استلمت الأثاث؟", "Received your furniture?")}</h2>
              <p>{t("تأكد من وصول القطع وفحصها قبل التأكيد. ينقل التأكيد إلى دفع الرصيد المتبقي.", "Check that all pieces have arrived and inspect them before confirming. Confirmation proceeds to balance payment.")}</p>
              {deliveryConfirm ? <div className="wb-stack" role="group" aria-label={t("تأكيد التسليم", "Confirm receipt")}>
                <p>{t("أؤكد أنني استلمت الأثاث وفحصته. يستحق المتبقي بالجنيه المصري:", "I confirm the furniture arrived and I inspected it. Balance due in EGP:")} {validQuote ? money(Math.max(0, quote!.totalEgp - quote!.depositEgp)) : "—"}</p>
                <button className="wb-primary" disabled={pending || !validQuote || paymentsUnavailable} onClick={() => action("confirm-delivery")} data-testid="confirm-delivery">{demo ? t("محاكاة استلام الأثاث", "Simulate delivery confirmation") : t("تأكيد الاستلام ومتابعة دفع المتبقي", "Confirm receipt & continue to balance payment")}</button>
                <button disabled={pending} onClick={() => setDeliveryConfirm(false)}>{t("إلغاء", "Cancel")}</button>
              </div> : <button className="wb-primary" disabled={paymentsUnavailable} onClick={() => setDeliveryConfirm(true)} data-testid="start-delivery">{t("تأكيد استلام الأثاث", "Confirm delivery received")}</button>}
              {paymentsUnavailable && <p className="wb-notice">{t("تأكيد التسليم ودفع المتبقي غير متاحين حتى ربط مزوّد الدفع. تواصل مع الورشة.", "Delivery confirmation and balance payment are unavailable until a payment provider is connected. Contact the workshop.")}</p>}
            </section>}
            {order.status === "closed" && <section className="wb-card"><h2>{t("شكراً لثقتك في ورشة رضا", "Thank you for choosing Reda's workshop")}</h2><p>{t("اكتمل طلبك. احتفظ بهذا الرابط كسجل للتصميم والدفعات.", "Your order is complete. Keep this link as a record of the design and payments.")}</p></section>}
            {["cancelled", "expired"].includes(order.status) && <p className="wb-notice">{t("هذا الطلب غير متاح للدفع. تواصل مع الورشة لتجديده.", "This order is not payable. Contact the workshop to renew it.")}</p>}
          </section>
          <aside className="wb-stack">
            {quote && <section className="wb-card"><h2>{t("عرض السعر", "Your quote")}</h2>
              <p className="wb-total">{money(quote.totalDisplay, quote.displayCurrency)}</p>
              <p className="wb-muted">{t("عملة العرض للاسترشاد فقط. الدفع يُحصّل بالجنيه المصري.", "Display currency is for reference only. Payments are charged in Egyptian pounds.")}</p>
              <dl>
                <dt>{t("الخامات", "Materials")}</dt><dd>{money(quote.materialsEgp)}</dd>
                <dt>{t("المصنعية", "Labor")}</dt><dd>{money(quote.laborEgp)}</dd>
                <dt>{t("الإجمالي المحصّل", "Total charged")}</dt><dd>{money(quote.totalEgp)}</dd>
                <dt>{t("سعر الصرف المثبت", "Locked exchange rate")}</dt><dd>1 {quote.displayCurrency} = {quote.fxRate} EGP</dd>
                <dt>{t("العربون بالجنيه", "Deposit in EGP")}</dt><dd>{money(quote.depositEgp)}</dd>
                <dt>{t("العربون بعملة العرض", "Deposit reference")}</dt><dd>{quote.fxRate > 0 ? money(quote.depositEgp / quote.fxRate, quote.displayCurrency) : "—"}</dd>
                <dt>{t("صالح حتى", "Expires")}</dt><dd>{new Date(quote.expiresAt).toLocaleString(lang === "ar" ? "ar-EG" : "en")}</dd>
              </dl>
              {order.status === "quoted" && <>
                {quoteExpired && <p className="wb-error">{t("انتهت صلاحية السعر. اطلب عرضاً جديداً من الورشة.", "This quote expired. Request a new quote from the workshop.")}</p>}
                {!validQuote && <p className="wb-error">{t("بيانات السعر غير مكتملة. تواصل مع الورشة.", "Quote details are incomplete. Contact the workshop.")}</p>}
                {paymentsUnavailable && <p className="wb-notice">{t("الدفع الإلكتروني غير متصل. يمكنك مراجعة العرض لكن لن يتم تحصيل أي مبلغ. حالات «محتجز/محوّل» في النسخة الحالية هي سجلات وليست ضماناً مالياً من المزوّد.", "Online payments are not connected. You can review the quote, but no money will be collected. Held/released labels are bookkeeping, not provider escrow.")}</p>}
                <button className="wb-primary" disabled={pending || quoteExpired || !validQuote || !order.designApproved || paymentsUnavailable} onClick={() => action("pay", { type: "deposit" })} data-testid="pay-deposit">{demo ? t("محاكاة دفع العربون", "Simulate deposit payment") : t("دفع العربون", "Pay deposit")}</button>
              </>}
            </section>}
            {order.ownerPhone && <section className="wb-card"><h2>{order.workshopName || t("تواصل مع الورشة", "Contact the workshop")}</h2>
              <a className="wb-link" href={`https://wa.me/${order.ownerPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{t("تواصل عبر واتساب", "Contact on WhatsApp")}</a>
            </section>}
            <section className="wb-card"><h2>{t("مراحل طلبك", "Order milestones")}</h2>
              <ol className="wb-timeline">{stageOrder.filter(s => s !== "delivered").map((stage, index) => <li key={stage} aria-current={stage === order.status ? "step" : undefined}>
                {stageOrder.indexOf(order.status) >= stageOrder.indexOf(stage) ? "✓ " : `${index + 1}. `}{statusText[stage]}
              </li>)}</ol>
            </section>
            {!!order.payments.length && <section className="wb-card"><h2>{t("الدفعات", "Payments")}</h2>{order.payments.map(payment => <p key={payment.id}>{payment.type === "deposit" ? t("عربون", "Deposit") : t("متبقي", "Balance")} • {money(payment.amountEgp)} • {labels[payment.state] || payment.state}</p>)}</section>}
          </aside>
        </div>
      </>}
    </main>
  </div>;
}
