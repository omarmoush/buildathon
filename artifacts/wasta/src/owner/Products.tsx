import { useCallback, useEffect, useState } from 'react';
import { Check, ImagePlus, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { api } from '@/quiz/api';
import { CATEGORIES, FINISH_LABELS, WOOD_LABELS, artUrl, categoryLabel, label } from '@/quiz/furniture';
import type { CatalogItem } from '@/quiz/types';

// Workshop products: pick catalog products for a new buyer's order, or add new ones to the catalog.
type Lang = 'ar' | 'en';
const DEFAULT_DIMS: Record<string, { w: number; d: number; h: number }> = {
  bed: { w: 180, d: 210, h: 105 }, nightstand: { w: 50, d: 45, h: 55 }, wardrobe: { w: 180, d: 60, h: 220 },
  dresser: { w: 140, d: 45, h: 85 }, 'dining-table': { w: 180, d: 90, h: 75 }, 'dining-chair': { w: 45, d: 50, h: 95 },
  sofa: { w: 210, d: 90, h: 85 }, 'coffee-table': { w: 110, d: 60, h: 45 },
};
const WOODS = ['oak', 'beech', 'walnut', 'pine'], FINISHES = ['natural', 'matte', 'white', 'walnut'];

export function useCatalog() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(() => {
    setFailed(false);
    api<CatalogItem[]>('/api/catalog').then(setItems).catch(() => setFailed(true));
  }, []);
  useEffect(reload, [reload]);
  return { items, failed, reload };
}

function Thumb({ item }: { item: CatalogItem }) {
  return <img src={item.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />;
}

export function NewProductForm({ lang, onCreated, onCancel }: { lang: Lang; onCreated: (item: CatalogItem) => void; onCancel?: () => void }) {
  const t = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const [category, setCategory] = useState('dining-table');
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [dims, setDims] = useState(DEFAULT_DIMS['dining-table']!);
  const [woods, setWoods] = useState<string[]>(['oak', 'walnut']);
  const [finishes, setFinishes] = useState<string[]>(['natural', 'matte']);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = (list: string[], value: string) => list.includes(value) ? list.filter(item => item !== value) : [...list, value];

  // A group, not a <form>: it is also used inside the new-order form, and forms cannot nest.
  async function submit() {
    if (busy || !name.trim()) return;
    setError('');
    if (!woods.length || !finishes.length) { setError(t('Choose at least one wood and one finish.', 'اختر خشباً وتشطيباً واحداً على الأقل.')); return; }
    setBusy(true);
    try {
      let imageUrl: string | undefined;
      if (photo) {
        const data = new FormData(); data.append('file', photo);
        imageUrl = (await api<{ url: string }>('/api/uploads', data)).url;
      }
      const item = await api<CatalogItem>('/api/catalog/products', { category, name: name.trim(), nameAr: nameAr.trim(), dimensions: dims, woods, finishes, imageUrl });
      onCreated(item);
      setName(''); setNameAr(''); setPhoto(null);
    } catch { setError(t('The product could not be saved. Check the fields and try again.', 'تعذر حفظ المنتج. راجع البيانات وحاول مجدداً.')); }
    finally { setBusy(false); }
  }

  return <div role="group" aria-label={t('New product', 'منتج جديد')} className="rounded-2xl border border-border bg-background p-4 md:p-5" data-testid="form-new-product"
    onKeyDown={event => { if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') { event.preventDefault(); submit(); } }}>
    <div className="grid gap-4 md:grid-cols-[1fr_180px]">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="label">{t('Category', 'الفئة')}</span>
          <select className="input" value={category} data-testid="select-product-category" onChange={e => { setCategory(e.target.value); setDims(DEFAULT_DIMS[e.target.value] ?? dims); }}>
            {CATEGORIES.map(item => <option key={item.id} value={item.id}>{item[lang]}</option>)}
          </select></label>
        <label className="block"><span className="label">{t('Product name (English)', 'اسم المنتج (إنجليزي)')}</span>
          <input className="input" maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder={t('Walnut round dining table', 'Walnut round dining table')} data-testid="input-product-name" /></label>
        <label className="block"><span className="label">{t('Product name (Arabic)', 'اسم المنتج (عربي)')}</span>
          <input className="input" dir="rtl" maxLength={120} value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder="ترابيزة سفرة مدورة جوز" /></label>
        <div><span className="label">{t('Dimensions (cm) W × D × H', 'الأبعاد (سم) ع × ع × ا')}</span>
          <div className="grid grid-cols-3 gap-2">{(['w', 'd', 'h'] as const).map(key =>
            <input key={key} className="input px-2 text-center" type="number" min={10} max={600} dir="ltr" aria-label={key} value={dims[key]} onChange={e => setDims({ ...dims, [key]: Number(e.target.value) })} />)}</div></div>
        <fieldset className="sm:col-span-2"><legend className="label">{t('Woods offered', 'أنواع الخشب المتاحة')}</legend>
          <div className="flex flex-wrap gap-2">{WOODS.map(wood => <button type="button" key={wood} aria-pressed={woods.includes(wood)} onClick={() => setWoods(toggle(woods, wood))}
            className={`status-pill ${woods.includes(wood) ? 'status-green' : 'status-gray'}`}>{label(WOOD_LABELS, wood, lang)}</button>)}</div></fieldset>
        <fieldset className="sm:col-span-2"><legend className="label">{t('Finishes offered', 'التشطيبات المتاحة')}</legend>
          <div className="flex flex-wrap gap-2">{FINISHES.map(finish => <button type="button" key={finish} aria-pressed={finishes.includes(finish)} onClick={() => setFinishes(toggle(finishes, finish))}
            className={`status-pill ${finishes.includes(finish) ? 'status-green' : 'status-gray'}`}>{label(FINISH_LABELS, finish, lang)}</button>)}</div></fieldset>
      </div>
      <div className="grid content-start gap-2">
        <div className="aspect-[16/10] overflow-hidden rounded-xl bg-secondary">
          <img alt="" className="h-full w-full object-cover" src={photo ? URL.createObjectURL(photo) : artUrl(category, { wood: woods[0], finish: finishes[0] })} />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:border-primary">
          <ImagePlus size={15} />{photo ? photo.name : t('Add a photo (optional)', 'أضف صورة (اختياري)')}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        <p className="text-xs text-muted-foreground">{t('Without a photo, buyers see a drawing in the wood they pick.', 'بدون صورة، يرى العميل رسماً بلون الخشب الذي يختاره.')}</p>
      </div>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      {onCancel && <button type="button" className="btn btn-outline" onClick={onCancel}>{t('Cancel', 'إلغاء')}</button>}
      <button type="button" onClick={submit} className="btn btn-primary" disabled={busy || !name.trim()} data-testid="button-save-product">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}{t('Add to catalog', 'أضف للكتالوج')}</button>
    </div>
  </div>;
}

/** Choose products for a new buyer's order; new products can be added to the catalog on the spot. */
export function ProductPicker({ lang, selected, onChange }: { lang: Lang; selected: string[]; onChange: (ids: string[]) => void }) {
  const t = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const { items, failed, reload } = useCatalog();
  const [adding, setAdding] = useState(false);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]);
  return <div className="grid gap-3">
    {failed ? <button type="button" className="btn btn-outline" onClick={reload}>{t('Catalog unavailable · retry', 'الكتالوج غير متاح · أعد المحاولة')}</button>
      : !items ? <div className="skeleton h-28" /> :
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{items.map(item => {
        const on = selected.includes(item.id);
        return <button type="button" key={item.id} onClick={() => toggle(item.id)} aria-pressed={on} data-testid={`product-${item.id}`}
          className={`relative overflow-hidden rounded-2xl border bg-card text-start transition ${on ? 'border-accent ring-2 ring-accent' : 'border-border hover:border-primary'}`}>
          <span className="block aspect-[16/10] bg-secondary"><Thumb item={item} /></span>
          <span className="block p-3"><b className="block text-sm leading-5">{lang === 'ar' ? item.nameAr || item.name : item.name}</b>
            <span className="text-xs text-muted-foreground">{categoryLabel(item.category ?? '', lang)}{item.custom ? ` · ${t('Added by you', 'أضفته أنت')}` : ''}</span></span>
          {on && <span className="absolute end-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-accent text-white"><Check size={14} /></span>}
        </button>;
      })}</div>}
    {adding ? <NewProductForm lang={lang} onCancel={() => setAdding(false)} onCreated={item => { setAdding(false); reload(); onChange([...selected, item.id]); }} />
      : <button type="button" className="btn btn-outline justify-self-start" onClick={() => setAdding(true)} data-testid="button-add-product"><Plus size={16} />{t('Add a new product', 'أضف منتجاً جديداً')}</button>}
  </div>;
}

/** Full catalog list with the workshop's own products removable. */
export function CatalogManager({ lang }: { lang: Lang }) {
  const t = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const { items, failed, reload } = useCatalog();
  const [error, setError] = useState('');
  async function remove(item: CatalogItem) {
    if (!window.confirm(t(`Remove “${item.name}” from the catalog?`, `حذف «${item.nameAr || item.name}» من الكتالوج؟`))) return;
    setError('');
    const response = await fetch(`/api/catalog/products/${encodeURIComponent(item.id)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
    if (!response?.ok) setError(t('The product could not be removed.', 'تعذر حذف المنتج.'));
    reload();
  }
  return <div className="grid gap-6">
    <section className="surface p-5 md:p-6"><h2 className="font-display mb-4 text-lg font-bold">{t('Add a product', 'أضف منتجاً')}</h2>
      <NewProductForm lang={lang} onCreated={reload} /></section>
    <section className="surface overflow-hidden">
      <div className="border-b border-border px-5 py-4"><h2 className="font-display text-lg font-bold">{t('Catalog', 'الكتالوج')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('Buyers see these products in the request form and on the home page.', 'يرى العملاء هذه المنتجات في نموذج الطلب والصفحة الرئيسية.')}</p></div>
      {error && <p role="alert" className="m-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {failed ? <div className="p-5"><button className="btn btn-outline" onClick={reload}>{t('Retry', 'إعادة المحاولة')}</button></div>
        : !items ? <div className="skeleton m-5 h-40" /> :
        <div className="divide-y divide-border">{items.map(item => <div key={item.id} className="flex items-center gap-4 px-5 py-3" data-testid={`catalog-row-${item.id}`}>
          <span className="block h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-secondary"><Thumb item={item} /></span>
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{lang === 'ar' ? item.nameAr || item.name : item.name}</p>
            <p className="text-xs text-muted-foreground">{categoryLabel(item.category ?? '', lang)} · <span dir="ltr">{item.defaultDims.w}×{item.defaultDims.d}×{item.defaultDims.h} cm</span></p></div>
          {item.custom ? <button className="btn btn-outline" style={{ minHeight: 38, padding: '6px 10px' }} onClick={() => remove(item)} aria-label={t('Remove', 'حذف')}><Trash2 size={15} /></button>
            : <span className="status-pill status-gray">{t('Built-in', 'أساسي')}</span>}
        </div>)}</div>}
    </section>
  </div>;
}
