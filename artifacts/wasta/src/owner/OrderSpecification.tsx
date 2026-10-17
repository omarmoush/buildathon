import type { Order } from '@workspace/api-client-react';
import Furniture3D from '../buyer/Furniture3D';
import { demoCatalog } from '../quiz/demo';
import { categoryLabel } from '../quiz/furniture';

type Spec = {
  productType?: string;
  pieceSource?: string;
  catalogItemId?: string;
  bedroomPieces?: string[];
  pieces?: string[];
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
    [tr('Included pieces', 'القطع المطلوبة'), spec.pieces?.length ? spec.pieces.map(piece => categoryLabel(piece, lang)).join(' · ') : spec.bedroomPieces?.join(' · ')],
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
  const glb = assetUrl(spec.glbUrl);
  const usdz = assetUrl(spec.usdzUrl);
  if (!glb) return null;
  const dims = spec.dimensions;
  const dimensions = dims && typeof dims.w === 'number' && typeof dims.d === 'number' && typeof dims.h === 'number'
    && dims.w > 0 && dims.d > 0 && dims.h > 0 ? { w: dims.w, d: dims.d, h: dims.h } : undefined;
  const base = spec.pieceSource === 'customized' ? demoCatalog.find(item => item.id === spec.catalogItemId)?.defaultDims : undefined;
  return <div className="mt-5 overflow-hidden rounded-xl border border-border" data-testid="owner-model-preview">
    <p className="px-4 pt-4 text-sm font-bold">{tr('Buyer’s 3D piece', 'قطعة العميل ثلاثية الأبعاد')}</p>
    <div className="wb wb-embedded"><Furniture3D model={{ glbUrl: glb, usdzUrl: usdz, thumbnailUrl: assetUrl(spec.thumbnailUrl) }}
      dimensions={dimensions} baseDimensions={base} lang={lang} /></div>
    <div className="flex flex-wrap gap-3 p-4">
      <a className="btn btn-outline" href={glb} target="_blank" rel="noreferrer">{tr('Open 3D file', 'فتح النموذج')}</a>
      {usdz && !base && <a className="btn btn-outline" href={usdz} rel="ar">{tr('View in AR · supported iPhone/iPad', 'عرض في المكان · آيفون وآيباد المدعومان')}</a>}
    </div>
  </div>;
}
