import { useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { DEFAULT_TARGET_MARGIN, DEMO_USD_RATE, rateImpact } from './quote-math';

type Language = 'ar' | 'en';
const egp = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP`;

export function DemoRateControl({ lang, rate, target, onRateChange, onTargetChange }: {
  lang: Language;
  rate: number;
  target: number;
  onRateChange: (rate: number) => void;
  onTargetChange: (target: number) => void;
}) {
  const tr = (en: string, ar: string) => lang === 'ar' ? ar : en;
  return <section className="surface mt-6 p-5 md:p-6" aria-labelledby="demo-rate-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="demo-rate-heading" className="font-display text-lg font-bold">{tr('Exchange-rate stress test', 'اختبار تغيّر سعر الصرف')}</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">{tr('Demo only. Imported materials track USD; labor and locked selling prices stay fixed. Unpaid, unexpired quotes only.', 'محاكاة فقط. تكلفة الخامات تتبع الدولار؛ المصنعية والسعر المثبّت لا يتغيران. للعروض غير المدفوعة والسارية فقط.')}</p>
      </div>
      <button type="button" className="btn btn-outline min-h-11" data-testid="button-reset-demo-rate" onClick={() => { onRateChange(DEMO_USD_RATE); onTargetChange(DEFAULT_TARGET_MARGIN); }}>
        <RotateCcw size={15} />{tr('Reset', 'إعادة الضبط')}
      </button>
    </div>
    <div className="mt-4 grid items-end gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="label">{tr('Demo USD rate · EGP per USD', 'سعر الدولار التجريبي · جنيه لكل دولار')}</span>
        <input data-testid="input-demo-usd-rate" className="input" type="number" min={DEMO_USD_RATE * .9} max={DEMO_USD_RATE * 1.2} step="0.01" value={Number(rate.toFixed(2))} onChange={event => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onRateChange(Math.min(DEMO_USD_RATE * 1.2, Math.max(DEMO_USD_RATE * .9, next)));
        }} />
        <input aria-label={tr('Change demo USD rate', 'تغيير سعر الدولار التجريبي')} data-testid="slider-demo-usd-rate" className="mt-3 min-h-11 w-full accent-accent" type="range" min="-10" max="20" step="1" value={Math.round((rate / DEMO_USD_RATE - 1) * 100)} onChange={event => onRateChange(DEMO_USD_RATE * (1 + Number(event.target.value) / 100))} />
      </label>
      <label className="block self-start">
        <span className="label">{tr('Target profit margin · % of selling price', 'هامش الربح المستهدف · ٪ من سعر البيع')}</span>
        <input data-testid="input-target-margin" className="input" type="number" min="0" max="100" step="1" value={target} onChange={event => onTargetChange(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} />
        <span className="mt-2 block text-xs text-muted-foreground">{tr(`Baseline: ${DEMO_USD_RATE} EGP per USD. No live FX feed.`, `سعر الأساس: ${DEMO_USD_RATE} جنيه للدولار. ليست أسعاراً مباشرة.`)}</span>
      </label>
    </div>
  </section>;
}

export function MarginWarning({ lang, margin }: { lang: Language; margin: number }) {
  return <span role="status" className="status-pill status-red" style={{ whiteSpace: 'normal', maxWidth: '100%' }} data-testid="badge-margin-warning">
    <AlertTriangle size={13} aria-hidden="true" />
    {lang === 'ar' ? 'أقل من هامش الربح المستهدف' : 'Below target margin'} · {margin.toFixed(1)}%
  </span>;
}

export function RateWhatIf({ lang, materials, labor, total }: {
  lang: Language; materials: number; labor: number; total: number;
}) {
  const [change, setChange] = useState(0);
  const tr = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const impact = rateImpact({ materialsCostEgp: materials, laborCostEgp: labor, totalEgp: total }, change);
  const baseline = rateImpact({ materialsCostEgp: materials, laborCostEgp: labor, totalEgp: total }, 0);
  return <section className="rounded-xl border border-border p-4" aria-labelledby="what-if-heading">
    <h3 id="what-if-heading" className="text-sm font-bold">{tr('What if the dollar changes?', 'ماذا لو تغيّر سعر الدولار؟')}</h3>
    <label className="mt-3 block">
      <span className="flex justify-between gap-3 text-sm">
        <span>{tr('Change in materials exchange rate', 'تغيّر سعر صرف الخامات')}</span>
        <output data-testid="text-rate-change" dir="ltr">{change > 0 ? '+' : ''}{change}%</output>
      </span>
      <input data-testid="slider-quote-rate" aria-label={tr('Rate change from minus 10 to plus 20 percent', 'تغيّر الصرف من ناقص ١٠ إلى زائد ٢٠ بالمئة')} className="mt-2 min-h-11 w-full accent-accent" type="range" min="-10" max="20" step="1" value={change} onChange={event => setChange(Number(event.target.value))} />
    </label>
    <dl className="grid grid-cols-2 gap-3 text-sm" aria-live="polite">
      <div><dt className="text-xs text-muted-foreground">{tr('Projected profit', 'الربح المتوقع')}</dt><dd className="mt-1 font-bold" data-testid="text-projected-profit">{egp(impact.profitEgp)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">{tr('Profit margin', 'هامش الربح')}</dt><dd className={`mt-1 font-bold ${impact.marginPercent < DEFAULT_TARGET_MARGIN ? 'text-red-700' : 'text-primary'}`} data-testid="text-projected-margin">{impact.marginPercent.toFixed(1)}%</dd></div>
      <div><dt className="text-xs text-muted-foreground">{tr('Materials after change', 'الخامات بعد التغيّر')}</dt><dd className="mt-1 font-semibold">{egp(impact.materialsEgp)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">{tr('Profit at original rate', 'الربح بسعر الصرف الأصلي')}</dt><dd className="mt-1 font-semibold">{egp(baseline.profitEgp)}</dd></div>
    </dl>
    <p className="mt-3 text-xs leading-6 text-muted-foreground">{tr('Scenario only: all materials are imported, labor stays fixed, and the locked EGP selling price does not change. Margin = profit ÷ selling price; the pricing input above is a cost markup.', 'محاكاة فقط: كل الخامات مستوردة، المصنعية ثابتة، وسعر البيع بالجنيه لا يتغير. هامش الربح = الربح ÷ سعر البيع؛ النسبة أعلاه تُضاف للتكلفة.')}</p>
  </section>;
}
