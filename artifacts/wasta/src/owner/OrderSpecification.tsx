import { createElement, useEffect, useRef, useState } from 'react';
import type { Order } from '@workspace/api-client-react';

type Spec = {
  productType?: string;
  style?: string[];
  dimensions?: { w?: number; d?: number; h?: number };
  wood?: string;
  finish?: string;
  budgetRange?: string;
  wantedBy?: string;
  deliveryCountry?: string;
  deliveryCity?: string;
  notes?: string;
  glbUrl?: string;
  usdzUrl?: string;
  thumbnailUrl?: string;
};

// Read optional quiz data without renaming or extending the shared API contract.
export function OrderSpecification({ order, lang }: { order: Order; lang: 'ar' | 'en' }) {
  const spec = (order as Order & { spec?: Spec }).spec;
  if (!spec || typeof spec !== 'object') return null;
  const tr = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const details = [
    [tr('Product', 'المنتج'), spec.productType],
    [tr('Style', 'الطراز'), Array.isArray(spec.style) ? spec.style.join(' · ') : undefined],
    [tr('Dimensions · cm', 'الأبعاد · سم'), spec.dimensions ? [spec.dimensions.w, spec.dimensions.d, spec.dimensions.h].map(value => value ?? '—').join(' × ') : undefined],
    [tr('Wood', 'الخشب'), spec.wood],
    [tr('Finish', 'التشطيب'), spec.finish],
    [tr('Budget range', 'الميزانية'), spec.budgetRange],
    [tr('Wanted by', 'موعد التسليم المطلوب'), spec.wantedBy],
    [tr('Delivery', 'التوصيل'), [spec.deliveryCity, spec.deliveryCountry].filter(Boolean).join(' · ')],
    [tr('Buyer notes', 'ملاحظات العميل'), spec.notes],
  ].filter(([, value]) => typeof value === 'string' && value.length > 0);
  return <>
    {details.length > 0 && <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2" data-testid="owner-order-spec">{details.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold leading-6">{value}</dd></div>)}</dl>}
    {spec.glbUrl && <ModelPreview spec={spec} lang={lang} />}
  </>;
}

function assetUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

function ModelPreview({ spec, lang }: { spec: Spec; lang: 'ar' | 'en' }) {
  const tr = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const viewer = useRef<HTMLElement>(null);
  const [failed, setFailed] = useState(false);
  const glb = assetUrl(spec.glbUrl);
  const usdz = assetUrl(spec.usdzUrl);
  useEffect(() => {
    if (!glb) return;
    setFailed(false);
    let script = document.querySelector<HTMLScriptElement>('script[data-owner-model-viewer]');
    if (!customElements.get('model-viewer') && !script) {
      script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://unpkg.com/@google/model-viewer@4.1.0/dist/model-viewer.min.js';
      script.dataset.ownerModelViewer = 'true';
      document.head.appendChild(script);
    }
    const onError = () => setFailed(true);
    script?.addEventListener('error', onError);
    const element = viewer.current;
    element?.addEventListener('error', onError);
    return () => {
      script?.removeEventListener('error', onError);
      element?.removeEventListener('error', onError);
    };
  }, [glb]);
  if (!glb) return null;
  return <div className="mt-5 overflow-hidden rounded-xl border border-border" data-testid="owner-model-preview">
    <p className="px-4 pt-4 text-sm font-bold">{tr('Buyer’s 3D piece', 'قطعة العميل ثلاثية الأبعاد')}</p>
    {!failed && createElement('model-viewer', {
      ref: viewer, src: glb, 'ios-src': usdz, poster: assetUrl(spec.thumbnailUrl),
      'camera-controls': true, 'touch-action': 'pan-y', ar: true,
      'ar-modes': 'webxr scene-viewer quick-look',
      alt: tr('Interactive furniture model', 'نموذج أثاث تفاعلي'),
      style: { width: '100%', height: '300px' },
    })}
    {failed && <p role="status" className="p-4 text-sm text-muted-foreground">{tr('The 3D viewer could not load. You can still open the model below.', 'تعذر تحميل العارض. يمكنك فتح ملف النموذج أدناه.')}</p>}
    <div className="flex flex-wrap gap-3 p-4">
      <a className="btn btn-outline" href={glb} target="_blank" rel="noreferrer">{tr('Open 3D file', 'فتح النموذج')}</a>
      {usdz && <a className="btn btn-outline" href={usdz} rel="ar">{tr('View in AR · supported iPhone/iPad', 'عرض في المكان · آيفون وآيباد المدعومان')}</a>}
    </div>
  </div>;
}
