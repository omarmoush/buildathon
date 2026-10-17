import { createContext, useContext, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter, useParams } from 'wouter';
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Bell, Check, CheckCircle2,
  Clock3, Copy, CreditCard, ExternalLink, FileImage, Globe2, Hammer, ImagePlus, LoaderCircle,
  LogOut, MessageCircle, PackageCheck, Plus, ShieldCheck, Upload, WalletCards, X,
} from 'lucide-react';
import {
  getGetBuyerOrderQueryKey, getGetDashboardQueryKey, getGetOrderQueryKey,
  getGetOwnerSessionQueryKey, getListNotificationsQueryKey, getListOrdersQueryKey,
  useAddOrderImage, useConfirmDelivery, useCreateOrder, useDecideOnDesign, useGetBuyerOrder,
  useGetDashboard, useGetOrder, useGetOwnerSession, useListNotifications, useListOrders, useLoginOwner,
  useLogoutOwner, useMarkOrderReady, usePayDeposit, usePostProgress, useSaveQuote,
  useSubmitDesign, useUploadImage,
} from '@workspace/api-client-react';
import type { Currency, Order, OrderInput, OrderStatus, PaymentInputMethod } from '@workspace/api-client-react';
import type { OrderStatus as ContractOrderStatus } from '../../../shared/contract';
import { formatDepositPercent } from '@/lib/quote-format';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DemoRateControl, MarginWarning, RateWhatIf } from '@/owner/RateTools';
import { OrderSpecification } from '@/owner/OrderSpecification';
import { OwnerDialog } from '@/owner/OwnerDialog';
import { DEFAULT_TARGET_MARGIN, DEMO_USD_RATE, needsAttention, quotePreview, quoteRisk, releasedMoney, requestsFirst } from '@/owner/quote-math';
import { QuizPage } from '@/quiz';
import { BuyerPage as PublicBuyerPage } from '@/buyer';
import { api as publicApi } from '@/quiz/api';
import LandingPage from '@/landing/LandingPage';
import { RequestReview, ReviewQueue } from '@/owner/RequestReview';

type Language = 'ar' | 'en';
const LanguageContext = createContext<{ lang: Language; setLang: (lang: Language) => void }>({ lang: 'ar', setLang: () => undefined });
const useLanguage = () => useContext(LanguageContext);
const useTranslation = () => {
  const { lang } = useLanguage();
  // Subscribe once per component; translating text must never call a hook.
  return (en: string, ar: string) => lang === 'ar' ? ar : en;
};
const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
// Keep the legacy client's draft label while accepting the shared wire contract.
const statusNames: Record<OrderStatus | ContractOrderStatus, [string, string]> = {
  requested: ['Requested', 'طلب جديد'], draft: ['Draft', 'مسودة'], design_review: ['Design review', 'مراجعة التصميم'], quoted: ['Quote sent', 'تم إرسال السعر'],
  deposit_paid: ['Deposit paid', 'تم دفع العربون'], in_production: ['In production', 'قيد التصنيع'],
  ready: ['Ready for delivery', 'جاهز للتسليم'], delivered: ['Delivered', 'تم التسليم'], closed: ['Complete', 'مكتمل'],
  cancelled: ['Cancelled', 'ملغي'], expired: ['Expired', 'منتهي'],
};
const stageIndex: Record<string, number> = { requested: 0, draft: 0, design_review: 0, quoted: 1, deposit_paid: 2, in_production: 2, ready: 3, delivered: 4, closed: 4 };
const statusTone = (s: OrderStatus) => ['deposit_paid', 'in_production', 'closed'].includes(s) ? 'status-green' : ['design_review', 'quoted', 'ready'].includes(s) ? 'status-orange' : ['cancelled', 'expired'].includes(s) ? 'status-red' : 'status-gray';
const money = (value?: number, currency = 'EGP') => `${new Intl.NumberFormat('en-US', { minimumFractionDigits: currency === 'EGP' ? 0 : 2, maximumFractionDigits: currency === 'EGP' ? 0 : 2 }).format(value || 0)} ${currency}`;
const dateShort = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
const buyerHref = (token: string) => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/b/${encodeURIComponent(token)}`;
const whatsappHref = (phone: string, message: string, country = 'Egypt') => {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) {
    const normalizedCountry = country.toLowerCase();
    const dialCode = normalizedCountry === 'sa' || normalizedCountry.includes('saudi') || normalizedCountry.includes('riyadh') || normalizedCountry.includes('السعود') ? '966'
      : normalizedCountry === 'ae' || normalizedCountry.includes('emirates') || normalizedCountry.includes('uae') || normalizedCountry.includes('dubai') || normalizedCountry.includes('الإمارات') ? '971'
        : '20';
    digits = `${dialCode}${digits.slice(1)}`;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};
const whatsappStatusMessage: Record<string, string> = {
  requested: 'تم إنشاء طلبك.',
  draft: 'تم إنشاء طلبك.',
  design_review: 'التصميم جاهز للمراجعة.',
  quoted: 'عرض السعر جاهز.',
  deposit_paid: 'تم استلام العربون.',
  in_production: 'بدأت الورشة تنفيذ طلبك.',
  ready: 'طلبك جاهز للتسليم.',
  delivered: 'تم تأكيد استلام طلبك.',
  closed: 'تم إغلاق الطلب وتحرير الدفعات.',
  expired: 'انتهت صلاحية عرض السعر.',
  cancelled: 'تم إلغاء الطلب.',
};
const whatsappOrderMessage = (buyerName: string, title: string, status: string, link: string) =>
  `مرحباً ${buyerName}، تحديث طلب "${title}": ${whatsappStatusMessage[status] || 'تحديث جديد على طلبك.'}\nرابط متابعة الطلب: ${link}`;
const demoFxRates: Record<Currency, number> = { EGP: 1, SAR: 13.1, AED: 13.35, USD: 48.5 };
const suggestedCurrency = (country: string): Currency => {
  const normalized = country.toLowerCase();
  if (normalized === 'sa' || normalized.includes('saudi') || normalized.includes('riyadh') || normalized.includes('السعود')) return 'SAR';
  if (normalized === 'ae' || normalized.includes('emirates') || normalized.includes('dubai') || normalized.includes('الإمارات') || normalized.includes('دبي')) return 'AED';
  return 'EGP';
};

function Button({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`btn ${className}`} {...props}>{children}</button>;
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="block mt-1.5 text-xs text-muted-foreground">{hint}</span>}</label>;
}
function Logo({ small = false }: { small?: boolean }) {
  return <div className="flex items-center gap-3" data-testid="text-wasta-brand">
    <div className={`grid place-items-center rounded-2xl bg-primary text-primary-foreground ${small ? 'h-9 w-9' : 'h-11 w-11'}`}><Hammer size={small ? 18 : 21} strokeWidth={2.1} /></div>
    <div className="leading-tight"><div className="font-display text-xl font-extrabold tracking-tight">wasta<span className="text-accent">.</span></div>{!small && <div className="text-[10px] font-semibold tracking-[.18em] text-muted-foreground uppercase">workshop orders</div>}</div>
  </div>;
}
function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  return <button data-testid="button-language-toggle" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground">
    <Globe2 size={16} /> {lang === 'ar' ? 'English' : 'العربية'}
  </button>;
}
function AppFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { lang } = useLanguage();
  return <main dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className={`app-shell grain ${className}`}>{children}</main>;
}
function Header({ ownerName, onLogout, showNotifications = false }: { ownerName?: string; onLogout?: () => void; showNotifications?: boolean }) {
  const t = useTranslation();
  return <header className="flex items-center justify-between gap-4 border-b border-border bg-background/85 px-5 py-4 backdrop-blur md:px-10">
    <Link href="/" className="text-foreground no-underline"><Logo small /></Link>
    <div className="flex items-center gap-2">
      {ownerName && <span className="hidden text-sm font-semibold text-muted-foreground sm:inline">{ownerName}</span>}
      {showNotifications && <OwnerNotificationMenu />}
      <LanguageToggle />
      {onLogout && <button data-testid="button-signout" onClick={onLogout} className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground" aria-label={t('Sign out', 'تسجيل الخروج')}><LogOut size={17} /></button>}
    </div>
  </header>;
}
function OwnerNotificationMenu() {
  const t = useTranslation();
  const notifications = useListNotifications();
  const [open, setOpen] = useState(false);
  const items = notifications.data || [];
  return <div className="relative">
    <button type="button" aria-label={t('Order notifications', 'إشعارات الطلبات')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground">
      <Bell size={17} />{items.length > 0 && <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-accent" />}
    </button>
    {open && <div role="menu" className="absolute end-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><strong className="text-sm">{t('Latest updates', 'آخر التحديثات')}</strong><button onClick={() => setOpen(false)} aria-label={t('Close notifications', 'إغلاق الإشعارات')} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground"><X size={15} /></button></div>
      {notifications.isLoading ? <div className="p-4 text-sm text-muted-foreground">{t('Loading updates…', 'جارٍ تحميل التحديثات...')}</div> : items.length ? <div className="max-h-80 overflow-auto">{items.slice(0, 8).map(item => <Link key={item.id} role="menuitem" href={`/orders/${item.orderId}`} onClick={() => setOpen(false)} className="block border-b border-border px-4 py-3 text-inherit no-underline last:border-0 hover:bg-secondary/60"><p className="text-sm leading-5">{item.message}</p><span className="mt-1 block text-xs text-muted-foreground">{dateShort(item.createdAt)}</span></Link>)}</div> : <div className="p-4 text-sm text-muted-foreground">{t('No updates yet.', 'لا توجد تحديثات بعد.')}</div>}
    </div>}
  </div>;
}
function LoadingScreen() {
  return <AppFrame><div className="mx-auto max-w-5xl p-6 md:p-10"><div className="skeleton mb-8 h-10 w-52" /><div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-32" /><div className="skeleton h-32" /><div className="skeleton h-32" /></div><div className="skeleton mt-8 h-64" /></div></AppFrame>;
}
function Problem({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const t = useTranslation();
  return <div className="surface mx-auto my-8 max-w-xl p-8 text-center"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary"><ShieldCheck size={23} /></div><h2 className="font-display text-xl font-bold">{t('Something did not load', 'لم يتم تحميل البيانات')}</h2><p className="mt-2 text-sm text-muted-foreground">{message || t('Check your connection, then try again.', 'تحقق من الاتصال ثم أعد المحاولة.')}</p><Button className="btn-primary mt-5" onClick={onRetry}>{t('Try again', 'إعادة المحاولة')}</Button></div>;
}

function OwnerHome() {
  const session = useGetOwnerSession({ query: { retry: false, queryKey: getGetOwnerSessionQueryKey() } });
  if (session.isLoading) return <LoadingScreen />;
  if (session.data) return <OwnerDashboard owner={session.data} />;
  return <OwnerLogin />;
}
function OwnerDashboard({ owner }: { owner: { name: string; workshopName: string } }) {
  const queryClient = useQueryClient();
  const logout = useLogoutOwner();
  return <DashboardPage owner={owner} onLogout={() => logout.mutate(undefined, { onSuccess: () => { queryClient.removeQueries({ queryKey: getGetOwnerSessionQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetOwnerSessionQueryKey() }); } })} />;
}
function OwnerLogin() {
  const t = useTranslation();
  const { lang } = useLanguage();
  const tr = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const login = useLoginOwner();
  const [phone, setPhone] = useState('01001234567');
  const [pin, setPin] = useState('1234');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    login.mutate({ data: { phone: phone.trim(), pin } }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetOwnerSessionQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); setLocation('/owner'); },
      onError: () => setError(tr('That phone number and PIN did not match.', 'رقم الهاتف أو الرقم السري غير صحيح.')),
    });
  };
  return <AppFrame className="min-h-[100dvh]">
    <Header />
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 md:grid-cols-[1.05fr_.95fr] md:items-center md:px-10 md:py-16">
      <section className="page-enter order-2 md:order-1">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-primary"><span className="h-2 w-2 rounded-full bg-accent" />{t('A calmer way to take custom orders', 'طريقة أهدأ لإدارة الطلبات الخاصة')}</div>
        <h1 className="font-display max-w-xl text-4xl font-extrabold leading-[1.13] tracking-tight md:text-6xl">{t('Good work deserves a clear agreement.', 'شغلك يستاهل اتفاق واضح.')}<span className="text-accent"> {t('From the first sketch.', 'من أول رسمة.')}</span></h1>
        <p className="mt-5 max-w-lg text-base leading-8 text-muted-foreground">{t('Keep every custom order, milestone, and payment in one simple place. Your buyer follows along with a private link—no account needed.', 'اجمع كل طلب خاص ومراحله ودفعاته في مكان واحد. يتابع عميلك من رابط خاص من غير ما يحتاج يعمل حساب.')}</p>
        <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3">
          {[[ShieldCheck, t('Clear milestones', 'مراحل واضحة')], [Globe2, t('Buyers anywhere', 'عملاء من أي مكان')], [MessageCircle, t('Made for WhatsApp', 'جاهز لواتساب')]].map(([Icon, label], i) => {
            const I = Icon as typeof ShieldCheck; return <div key={i} className="flex items-center gap-2 rounded-xl bg-secondary/70 p-3 text-xs font-semibold text-secondary-foreground"><I size={16} />{label as string}</div>;
          })}
        </div>
        <div className="mt-10 flex items-center gap-3 text-xs text-muted-foreground"><span className="flex -space-x-2 rtl:space-x-reverse">{['ح', 'م', 'س'].map((x, i) => <span key={x} className={`grid h-8 w-8 place-items-center rounded-full border-2 border-background text-[11px] font-bold text-white ${['bg-primary', 'bg-accent', 'bg-[#6f8b7e]'][i]}`}>{x}</span>)}</span><span>{t('Built around the way workshops already work', 'مصمم على طريقة شغل الورش كل يوم')}</span></div>
      </section>
      <section className="page-enter order-1 md:order-2">
        <div className="surface mx-auto max-w-md overflow-hidden">
          <div className="bg-primary px-7 py-7 text-primary-foreground">
            <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.15em] opacity-70">{t('Workshop access', 'دخول الورشة')}</p><h2 className="mt-2 font-display text-2xl font-bold">{t('Welcome back', 'أهلاً بعودتك')}</h2></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><ShieldCheck size={20} /></div></div>
            <p className="mt-3 text-sm leading-6 opacity-75">{t('Sign in to see your orders and keep every next step clear.', 'سجّل الدخول لمتابعة طلباتك ومعرفة الخطوة القادمة.')}</p>
          </div>
          <form className="space-y-5 p-6 md:p-7" onSubmit={submit}>
            <Field label={t('Workshop phone number', 'رقم هاتف الورشة')} hint={t('Demo sign-in · 01001234567 · PIN 1234', 'دخول تجريبي · 01001234567 · الرقم السري 1234')}>
              <input data-testid="input-owner-phone" className="input" type="tel" autoComplete="tel" placeholder="+20 100 000 0000" value={phone} onChange={e => setPhone(e.target.value)} required minLength={6} dir="ltr" />
            </Field>
            <Field label={t('4-digit PIN', 'الرقم السري من ٤ أرقام')} hint={t('Demo PIN: 1234', 'الرقم التجريبي: 1234')}>
              <div className="relative"><input data-testid="input-owner-pin" className="input" type={showPin ? 'text' : 'password'} inputMode="numeric" maxLength={4} pattern="[0-9]{4}" placeholder="••••" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} required dir="ltr" /><button type="button" data-testid="button-toggle-pin" onClick={() => setShowPin(!showPin)} className="absolute inset-y-0 end-3 text-xs font-semibold text-muted-foreground">{showPin ? t('Hide', 'إخفاء') : t('Show', 'إظهار')}</button></div>
            </Field>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <Button type="submit" className="btn-primary w-full" disabled={login.isPending} data-testid="button-owner-login">{login.isPending ? <LoaderCircle className="animate-spin" size={17} /> : t('Open my workshop', 'افتح ورشتي')}<ArrowUpRight size={17} /></Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">{t('Your buyers only see the order page you share with them.', 'عملاؤك يرون فقط صفحة الطلب التي تشاركها معهم.')}</p>
          </form>
        </div>
      </section>
    </div>
    <footer className="mx-auto flex max-w-6xl justify-between px-5 pb-6 text-xs text-muted-foreground md:px-10"><Logo small /><span>{t('Orders made clear.', 'طلبات واضحة.')}</span></footer>
  </AppFrame>;
}

function DashboardPage({ owner, onLogout }: { owner: { name: string; workshopName: string }; onLogout: () => void }) {
  const t = useTranslation();
  const { lang } = useLanguage();
  const dashboard = useGetDashboard({ query: { refetchInterval: 15000, queryKey: getGetDashboardQueryKey() } });
  const ordersQuery = useListOrders({ query: { refetchInterval: 15000, queryKey: getListOrdersQueryKey() } });
  const notifications = useListNotifications({ query: { refetchInterval: 15000, queryKey: getListNotificationsQueryKey() } });
  const [filter, setFilter] = useState('all');
  const [demoUsdRate, setDemoUsdRate] = useState(DEMO_USD_RATE);
  const [targetMargin, setTargetMargin] = useState(DEFAULT_TARGET_MARGIN);
  const orders = ordersQuery.data || dashboard.data?.orders || [];
  const filtered = requestsFirst(filter === 'all' ? orders : filter === 'review'
    ? orders.filter(o => ['requested', 'draft'].includes(o.status) || o.depositReviewPending)
    : filter === 'deposited' ? orders.filter(o => o.payments.some(payment => payment.type === 'deposit' && payment.state !== 'pending'))
    : orders.filter(o => o.status === filter));
  const refresh = () => { dashboard.refetch(); ordersQuery.refetch(); notifications.refetch(); };
  return <AppFrame>
    <Header ownerName={owner.workshopName || owner.name} onLogout={onLogout} showNotifications />
    <div className="page-enter page-pad mx-auto max-w-6xl px-5 py-8 md:px-10 md:py-11">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-accent">{t('Your workshop', 'ورشتك')}</p><h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">{t('Good to see you', 'أهلاً بيك')}{owner.name ? `، ${owner.name}` : ''}</h1><p className="mt-2 text-sm text-muted-foreground">{t('A clear view of every order in motion.', 'نظرة واضحة على كل طلب شغال.')}</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/w/reda" className="btn btn-outline" data-testid="link-buyer-quiz">{t('Buyer request form', 'نموذج طلب العميل')}</Link><Link href="/orders/new" className="btn btn-primary" data-testid="link-new-order"><Plus size={18} />{t('New custom order', 'طلب خاص جديد')}</Link></div>
      </div>
      {dashboard.isLoading ? <div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-32" /><div className="skeleton h-32" /><div className="skeleton h-32" /></div> : dashboard.isError ? <Problem onRetry={refresh} /> : <>
        <div className="grid gap-4 md:grid-cols-[1.1fr_1fr_1fr]">
          <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm md:p-6">
            <div className="flex items-start justify-between"><span className="text-sm font-semibold opacity-80">{t('Orders in progress', 'طلبات قيد التنفيذ')}</span><PackageCheck size={19} /></div>
            <p className="mt-6 font-display text-4xl font-extrabold" data-testid="text-open-orders">{dashboard.data?.openOrders ?? 0}</p><p className="mt-1 text-xs opacity-70">{t('Your active workshop list', 'طلبات الورشة النشطة')}</p>
          </div>
          <div className="surface p-5 md:p-6"><div className="flex items-start justify-between text-muted-foreground"><span className="text-sm font-semibold">{t('Deposits collected', 'العربون المحصل')}</span><div className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary"><ArrowDownLeft size={17} /></div></div><p className="mt-5 font-display text-3xl font-extrabold" data-testid="text-deposits-collected">{money(dashboard.data?.depositsCollectedEgp)}</p><p className="mt-1 text-xs text-muted-foreground">{t('Held or released · simulated ledger', 'محفوظ أو مُحرّر · سجل تجريبي')}</p></div>
          <div className="surface p-5 md:p-6"><div className="flex items-start justify-between text-muted-foreground"><span className="text-sm font-semibold">{t('Balances to collect', 'المتبقي للتحصيل')}</span><div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent"><Clock3 size={17} /></div></div><p className="mt-5 font-display text-3xl font-extrabold" data-testid="text-balances-due">{money(dashboard.data?.balancesDueEgp)}</p><p className="mt-1 text-xs text-muted-foreground">{t('Due at delivery', 'مستحق عند التسليم')}</p></div>
        </div>
        <div className="surface mt-4 flex flex-wrap items-center justify-between gap-2 p-5">
          <div><h2 className="text-sm font-bold">{t('Money released to workshop', 'المبالغ المُحرّرة للورشة')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('Released deposits and balances · simulated, not a bank transfer', 'العربون والمتبقي المُحرّران · محاكاة وليست تحويلاً بنكياً')}</p></div>
          <strong className="font-display text-2xl text-primary" data-testid="text-released-money">{money(releasedMoney(orders))}</strong>
        </div>
        <DemoRateControl lang={lang} rate={demoUsdRate} target={targetMargin} onRateChange={setDemoUsdRate} onTargetChange={setTargetMargin} />
        <ReviewQueue orders={orders} lang={lang} filter={filter} onFilter={setFilter} />
        <div className="mt-9 grid gap-6 lg:grid-cols-[1fr_290px]">
          <section className="surface overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
              <div><h2 className="font-display text-xl font-bold">{t('Orders', 'الطلبات')}</h2><p className="mt-1 text-xs text-muted-foreground">{t(`${orders.length} orders on your bench`, `${orders.length} طلب على طاولتك`)}</p></div>
              <select aria-label={t('Filter orders', 'تصفية الطلبات')} data-testid="select-order-filter" className="input min-h-10 w-full py-2 sm:w-48" value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="all">{t('All orders', 'كل الطلبات')}</option><option value="review">{t('Pending workshop review', 'تنتظر مراجعة الورشة')}</option><option value="deposited">{t('Deposited orders', 'طلبات بعربون')}</option><option value="requested">{t('Requested', 'طلب جديد')}</option><option value="draft">{t('New requests', 'طلبات جديدة')}</option><option value="design_review">{t('Design review', 'مراجعة التصميم')}</option><option value="quoted">{t('Quote sent', 'تم إرسال السعر')}</option><option value="deposit_paid">{t('Deposit paid', 'تم دفع العربون')}</option><option value="in_production">{t('In production', 'قيد التصنيع')}</option><option value="ready">{t('Ready for delivery', 'جاهز للتسليم')}</option><option value="closed">{t('Complete', 'مكتمل')}</option>
              </select>
            </div>
            {orders.length === 0 ? <EmptyOrders /> : filtered.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">{t('No orders in this stage.', 'لا توجد طلبات في هذه المرحلة.')}</div> :
              <div>{filtered.map(order => <OrderRow key={order.id} order={order} risk={quoteRisk(order, demoUsdRate, targetMargin)} />)}</div>}
          </section>
          <aside className="surface h-fit overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-5"><div><h2 className="font-display font-bold">{t('Latest updates', 'آخر التحديثات')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('Order activity', 'نشاط الطلبات')}</p></div><Bell size={18} className="text-accent" /></div>
            {notifications.isLoading ? <div className="space-y-3 p-5"><div className="skeleton h-14" /><div className="skeleton h-14" /></div> : (notifications.data || dashboard.data?.notifications || []).length ? <div className="divide-y divide-border">
              {(notifications.data || dashboard.data?.notifications || []).slice(0, 6).map(n => <Link key={n.id} href={`/orders/${n.orderId}`} className="clickable-row block p-4 text-inherit no-underline" data-testid={`notification-${n.id}`}><p className="text-sm leading-6">{n.message}</p><span className="mt-1 block text-xs text-muted-foreground">{dateShort(n.createdAt)}</span></Link>)}
            </div> : <div className="px-5 py-8 text-center text-sm text-muted-foreground">{t('No updates yet. New activity will appear here.', 'لا توجد تحديثات بعد. ستظهر الأنشطة الجديدة هنا.')}</div>}
          </aside>
        </div>
      </>}
    </div>
  </AppFrame>;
}
function EmptyOrders() {
  const t = useTranslation();
  return <div className="p-8 text-center md:p-14"><div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-secondary text-primary"><Hammer size={27} /></div><h3 className="font-display mt-4 text-xl font-bold">{t('Your first order starts here', 'ابدأ أول طلب من هنا')}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{t('Add the buyer and the piece they have in mind. We’ll help you keep the steps clear.', 'أضف بيانات العميل والقطعة التي يريدها. وسنساعدك على توضيح كل خطوة.')}</p><Link href="/orders/new" className="btn btn-primary mt-5" data-testid="link-first-order"><Plus size={17} />{t('Create an order', 'أنشئ طلباً')}</Link></div>;
}
function OrderRow({ order, risk }: { order: Order; risk: ReturnType<typeof quoteRisk> }) {
  const t = useTranslation();
  const { lang } = useLanguage();
  return <Link href={`/orders/${order.id}`} data-testid={`link-order-${order.id}`} className="clickable-row flex items-center gap-4 border-b border-border px-5 py-4 text-inherit no-underline last:border-0 md:px-6">
    <div className="hidden h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-secondary sm:block">{order.images?.[0]?.url ? <img src={order.images[0].url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-primary"><FileImage size={19} /></div>}</div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{order.title}</h3><span className={`status-pill ${statusTone(order.status)}`}>{statusNames[order.status]?.[lang === 'ar' ? 1 : 0] || order.status}</span>{needsAttention(order) && <span className="status-pill status-orange" data-testid="badge-new-request">{t('New request · start here', 'طلب جديد · ابدأ هنا')}</span>}</div><p className="mt-1 truncate text-xs text-muted-foreground">{order.buyerName} · {order.buyerCountry} · {dateShort(order.createdAt)}</p>{risk?.belowTarget && <div className="mt-2"><MarginWarning lang={lang} margin={risk.marginPercent} /></div>}</div>
    <div className="hidden text-end sm:block"><p className="font-semibold">{order.quote ? money(order.quote.totalDisplay, order.quote.displayCurrency) : t('Awaiting quote', 'بانتظار السعر')}</p><p className="mt-1 text-xs text-muted-foreground">{order.progress?.length || 0} {t('updates', 'تحديثات')}</p></div>
    <ArrowLeft className="shrink-0 text-muted-foreground rtl:rotate-180" size={18} />
  </Link>;
}

function OwnerGate({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const session = useGetOwnerSession({ query: { retry: false, queryKey: getGetOwnerSessionQueryKey() } });
  useEffect(() => {
    if (!session.isLoading && !session.data && location !== '/owner') setLocation('/owner');
  }, [location, session.data, session.isLoading, setLocation]);
  if (session.isLoading) return <LoadingScreen />;
  if (!session.data) return <LoadingScreen />;
  return <>{children}</>;
}
function NewOrderPage() {
  const t = useTranslation();
  const { lang } = useLanguage();
  const tr = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createOrder = useCreateOrder();
  const upload = useUploadImage();
  const addImage = useAddOrderImage();
  const [values, setValues] = useState<OrderInput>({ buyerName: '', buyerPhone: '', buyerCountry: '', title: '', description: '', dimensions: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const update = (key: keyof OrderInput, value: string) => setValues(prev => ({ ...prev, [key]: value }));
  const onFiles = (e: ChangeEvent<HTMLInputElement>) => setFiles(Array.from(e.target.files || []));
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try {
      const order = await createOrder.mutateAsync({ data: values });
      for (const file of files) {
        const dataUrl = await fileToDataUrl(file);
        const saved = await upload.mutateAsync({ data: { fileName: file.name, dataUrl } });
        await addImage.mutateAsync({ id: order.id, data: { url: saved.url, kind: 'reference' } });
      }
      await Promise.all([queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }), queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) })]);
      setLocation(`/orders/${order.id}`);
    } catch { setError(tr('The order could not be saved. Please try again.', 'تعذر حفظ الطلب. حاول مرة أخرى.')); }
  };
  return <OwnerGate><AppFrame><Header showNotifications /><div className="page-enter page-pad mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-11">
    <Link href="/owner" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground no-underline"><ArrowRight size={16} className="rtl:rotate-180" />{t('Back to orders', 'العودة للطلبات')}</Link>
    <div className="mb-7"><p className="text-sm font-semibold text-accent">{t('A good start', 'بداية واضحة')}</p><h1 className="font-display mt-1 text-3xl font-extrabold md:text-4xl">{t('Create a custom order', 'إنشاء طلب خاص')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('Start with the buyer and the piece. You can add a design and quote next.', 'ابدأ ببيانات العميل والقطعة. يمكنك إضافة التصميم والسعر بعد ذلك.')}</p></div>
    <form onSubmit={onSubmit} className="surface p-5 md:p-8">
      <div className="mb-6 flex items-center gap-3 border-b border-border pb-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary"><PackageCheck size={18} /></div><div><h2 className="font-display font-bold">{t('Order basics', 'بيانات الطلب')}</h2><p className="text-xs text-muted-foreground">{t('Only the essentials for now', 'المعلومات الأساسية الآن')}</p></div></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('Buyer name', 'اسم العميل')}><input data-testid="input-buyer-name" className="input" value={values.buyerName} onChange={e => update('buyerName', e.target.value)} required placeholder={t('Full name', 'الاسم بالكامل')} /></Field>
        <Field label={t('Buyer WhatsApp number', 'رقم واتساب العميل')}><input data-testid="input-buyer-phone" className="input" type="tel" dir="ltr" value={values.buyerPhone} onChange={e => update('buyerPhone', e.target.value)} required minLength={6} placeholder="+44 7700 900000" /></Field>
        <Field label={t('Buyer country', 'بلد العميل')}><input data-testid="input-buyer-country" className="input" value={values.buyerCountry} onChange={e => update('buyerCountry', e.target.value)} required placeholder={t('For example, United Kingdom', 'مثال: المملكة المتحدة')} /></Field>
        <Field label={t('Piece or order title', 'اسم القطعة أو الطلب')}><input data-testid="input-order-title" className="input" value={values.title} onChange={e => update('title', e.target.value)} required placeholder={t('Walnut dining table', 'طاولة طعام من خشب الجوز')} /></Field>
        <div className="sm:col-span-2"><Field label={t('Short description', 'وصف مختصر')}><textarea data-testid="input-order-description" className="input" value={values.description} onChange={e => update('description', e.target.value)} placeholder={t('Materials, finish, details the buyer asked for…', 'الخامات والتشطيب والتفاصيل التي طلبها العميل...')} /></Field></div>
        <Field label={t('Dimensions', 'الأبعاد')}><input data-testid="input-order-dimensions" className="input" value={values.dimensions} onChange={e => update('dimensions', e.target.value)} placeholder={t('180 × 90 × 75 cm', '١٨٠ × ٩٠ × ٧٥ سم')} /></Field>
        <Field label={t('Reference photos', 'صور مرجعية')} hint={t('Add sketches or inspiration. You can share the design after creating the order.', 'أضف رسومات أو صور إلهام. يمكنك مشاركة التصميم بعد إنشاء الطلب.')}>
          <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-3 text-sm font-semibold text-muted-foreground hover:border-primary"><ImagePlus size={17} />{files.length ? `${files.length} ${t('files selected', 'ملفات محددة')}` : t('Choose photos', 'اختر صوراً')}<input data-testid="input-reference-images" type="file" accept="image/*" multiple className="sr-only" onChange={onFiles} /></label>
        </Field>
      </div>
      {files.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{files.map(f => <span key={`${f.name}-${f.size}`} className="rounded-full bg-secondary px-3 py-1 text-xs">{f.name}</span>)}</div>}
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-8 flex flex-col-reverse justify-between gap-3 border-t border-border pt-5 sm:flex-row sm:items-center"><span className="text-xs text-muted-foreground">{t('A private buyer link is created automatically.', 'سيتم إنشاء رابط خاص بالعميل تلقائياً.')}</span><Button type="submit" className="btn-primary" disabled={createOrder.isPending || upload.isPending || addImage.isPending} data-testid="button-create-order">{createOrder.isPending || upload.isPending || addImage.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <Plus size={18} />}{t('Create order', 'إنشاء الطلب')}</Button></div>
    </form>
  </div></AppFrame></OwnerGate>;
}
function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read image')); reader.readAsDataURL(file); });
}

function OrderDetailPage() {
  return <OwnerGate><OrderDetailAuthed /></OwnerGate>;
}
function OrderDetailAuthed() {
  const t = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id || '';
  const orderQuery = useGetOrder(id, { query: { enabled: !!id, queryKey: getGetOrderQueryKey(id), refetchInterval: 10000 } });
  const order = orderQuery.data;
  if (orderQuery.isLoading) return <LoadingScreen />;
  if (orderQuery.isError || !order) return <AppFrame><Header showNotifications /><Problem message={t('We could not find this order.', 'لم نتمكن من العثور على هذا الطلب.')} onRetry={() => orderQuery.refetch()} /></AppFrame>;
  return <OrderDetailContent key={order.id} order={order} />;
}
function OrderDetailContent({ order }: { order: Order }) {
  const t = useTranslation();
  const { lang } = useLanguage();
  const tr = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const queryClient = useQueryClient();
  const upload = useUploadImage();
  const submitDesign = useSubmitDesign();
  const saveQuote = useSaveQuote();
  const postProgress = usePostProgress();
  const markReady = useMarkOrderReady();
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [designNote, setDesignNote] = useState('');
  const [startingDesign, setStartingDesign] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [formError, setFormError] = useState('');
  const [quote, setQuote] = useState(() => {
    const currency = order.quote?.displayCurrency || suggestedCurrency(order.buyerCountry);
    return { materials: String(order.estimate?.materialsEgp ?? ''), labor: String(order.estimate?.laborEgp ?? ''), margin: String(order.estimate?.marginPercent ?? 25), deposit: String((order.estimate?.depositPercent ?? .5) * 100), currency, fx: String(order.quote?.fxRateToEgp || demoFxRates[currency]), expires: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) };
  });
  const [progress, setProgress] = useState({ stage: 'cutting', note: '' });
  const tokenUrl = buyerHref(order.magicToken);
  const invalidateOrder = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) }), queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }), queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() })]); };
  const copyLink = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(tokenUrl);
      setShareCopied(true); setTimeout(() => setShareCopied(false), 1800);
    } catch { setFormError(tr('Copy is unavailable. Use the buyer link shown below.', 'تعذر النسخ. استخدم رابط العميل الظاهر أدناه.')); }
  };
  const shareDesign = async (e: FormEvent) => {
    e.preventDefault(); if (!designFile) return;
    setFormError('');
    try {
      const uploaded = await upload.mutateAsync({ data: { fileName: designFile.name, dataUrl: await fileToDataUrl(designFile) } });
      await submitDesign.mutateAsync({ id: order.id, data: { imageUrl: uploaded.url, note: designNote } });
      await invalidateOrder(); setDesignFile(null); setDesignNote('');
    } catch { setFormError(tr('Design could not be shared. Use a JPEG, PNG, WebP, or GIF under 8 MB.', 'تعذرت مشاركة التصميم. استخدم صورة JPEG أو PNG أو WebP أو GIF أقل من ٨ ميجابايت.')); }
  };
  const startQuizDesign = async () => {
    if (startingDesign) return;
    setStartingDesign(true); setFormError('');
    try {
      await publicApi(`/api/orders/${encodeURIComponent(order.id)}/start-design`, {});
      await invalidateOrder();
    } catch { setFormError(tr('The design could not be sent for review. Refresh the order and try again.', 'تعذر إرسال التصميم للمراجعة. حدّث الطلب وحاول مجدداً.')); }
    finally { setStartingDesign(false); }
  };
  const submitQuote = async (e: FormEvent) => {
    e.preventDefault(); setFormError('');
    try {
      const expiresAt = quote.expires ? new Date(`${quote.expires}T23:59:59`).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString();
      await saveQuote.mutateAsync({ id: order.id, data: { materialsCostEgp: Number(quote.materials), laborCostEgp: Number(quote.labor), marginPercent: Number(quote.margin), depositPercent: Number(quote.deposit) / 100, displayCurrency: quote.currency, fxRateToEgp: Number(quote.fx), expiresAt } });
      await invalidateOrder(); setQuoteOpen(false);
    } catch { setFormError(tr('Quote could not be saved. Check the amounts, exchange rate, and future expiry.', 'تعذر حفظ السعر. تحقق من المبالغ وسعر الصرف وتاريخ انتهاء مستقبلي.')); }
  };
  const submitProgress = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setFormError('');
    const form = new FormData(e.currentTarget);
    const photo = form.get('photo');
    try {
      let photoUrl: string | null = null;
      if (photo instanceof File && photo.size) photoUrl = (await upload.mutateAsync({ data: { fileName: photo.name, dataUrl: await fileToDataUrl(photo) } })).url;
      await postProgress.mutateAsync({ id: order.id, data: { stage: progress.stage, note: progress.note, photoUrl } });
      await invalidateOrder(); setProgressOpen(false); setProgress({ stage: 'cutting', note: '' });
    } catch { setFormError(tr('Progress update could not be posted. Photos must be JPEG, PNG, WebP, or GIF under 8 MB.', 'تعذر نشر التحديث. استخدم صورة JPEG أو PNG أو WebP أو GIF أقل من ٨ ميجابايت.')); }
  };
  const { totalEgp, totalDisplay } = quotePreview(Number(quote.materials || 0), Number(quote.labor || 0), Number(quote.margin || 0), Number(quote.fx || 0));
  const depositPercent = Number(quote.deposit);
  const depositAmountDisplay = Math.round(totalDisplay * depositPercent) / 100;
  const openFinalQuote = () => {
    setQuote(previous => ({ ...previous, materials: String(order.estimate?.materialsEgp ?? previous.materials),
      labor: String(order.estimate?.laborEgp ?? previous.labor), margin: String(order.estimate?.marginPercent ?? previous.margin),
      deposit: String((order.estimate?.depositPercent ?? .5) * 100) }));
    setFormError(''); setQuoteOpen(true);
  };
  return <AppFrame><Header showNotifications /><div className="page-enter page-pad mx-auto max-w-6xl px-5 py-7 md:px-10 md:py-10">
    <Link href="/owner" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground no-underline"><ArrowRight size={16} className="rtl:rotate-180" />{t('All orders', 'كل الطلبات')}</Link>
    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
      <div><div className="mb-2 flex flex-wrap items-center gap-2"><span className={`status-pill ${statusTone(order.status)}`}>{statusNames[order.status]?.[lang === 'ar' ? 1 : 0]}</span><span className="text-xs text-muted-foreground">#{order.id.slice(0, 8)}</span></div><h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">{order.title}</h1><p className="mt-2 text-sm text-muted-foreground">{order.buyerName} · {order.buyerCountry} · {t('Created', 'تاريخ الإنشاء')} {dateShort(order.createdAt)}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button className="btn-outline" onClick={copyLink} data-testid="button-copy-buyer-link">{shareCopied ? <Check size={17} /> : <Copy size={17} />}{shareCopied ? t('Link copied', 'تم نسخ الرابط') : t('Copy buyer link', 'نسخ رابط العميل')}</Button>
        <a className="btn btn-soft" target="_blank" rel="noreferrer" href={whatsappHref(order.buyerPhone, whatsappOrderMessage(order.buyerName, order.title, order.status, tokenUrl), order.buyerCountry)} data-testid="link-whatsapp"><MessageCircle size={17} />{t('WhatsApp', 'واتساب')}</a>
      </div>
    </div>
    <div className="mt-7 grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
      <div className="space-y-5">
        <RequestReview order={order} lang={lang} onUpdated={invalidateOrder} />
        <section className="surface p-5 md:p-6"><div className="flex items-center justify-between"><div><h2 className="font-display text-lg font-bold">{t('Order details', 'تفاصيل الطلب')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('What the buyer asked for', 'تفاصيل طلب العميل')}</p></div><Hammer size={20} className="text-accent" /></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><Detail label={t('Buyer', 'العميل')} value={order.buyerName} /><Detail label={t('WhatsApp', 'واتساب')} value={order.buyerPhone} /><Detail label={t('Dimensions', 'الأبعاد')} value={order.dimensions || '—'} /><Detail label={t('Description', 'الوصف')} value={order.description || '—'} /></div>
          <OrderSpecification order={order} lang={lang} />
          {order.images?.length > 0 && <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{order.images.map(image => <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="group relative block aspect-[4/3] overflow-hidden rounded-xl bg-secondary" data-testid={`image-order-${image.id}`}><img src={image.url} alt={image.kind === 'design' ? t('Shared design', 'التصميم المشارك') : t('Reference', 'صورة مرجعية')} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" /><span className="absolute bottom-2 start-2 rounded-full bg-card/90 px-2 py-1 text-[10px] font-bold">{image.kind === 'design' ? t('Design', 'تصميم') : t('Reference', 'مرجع')}</span></a>)}</div>}
        </section>
          {!['closed', 'cancelled', 'expired'].includes(order.status) && <>
           {['requested', 'draft', 'design_review'].includes(order.status) && <section className="surface p-5 md:p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold">{t('Share a design', 'مشاركة التصميم')}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('Send a sketch or render for the buyer to review on their private link.', 'أرسل رسماً أو تصوراً للمراجعة من خلال الرابط الخاص بالعميل.')}</p></div><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><FileImage size={17} /></div></div>
             {order.status === ('requested' as OrderStatus) && (order as Order & { spec?: { glbUrl?: string } }).spec?.glbUrl && <Button className="btn-primary mt-4" disabled={startingDesign} onClick={startQuizDesign} data-testid="button-start-quiz-design">{startingDesign ? <LoaderCircle size={17} className="animate-spin" /> : <Check size={17} />}{t('Send selected 3D design for approval', 'إرسال التصميم الثلاثي الأبعاد للموافقة')}</Button>}
             <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={shareDesign}><label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm text-muted-foreground"><Upload size={16} /><span className="truncate">{designFile?.name || t('Choose design image', 'اختر صورة التصميم')}</span><input data-testid="input-design-image" type="file" accept="image/*" className="sr-only" onChange={e => setDesignFile(e.target.files?.[0] || null)} /></label><input data-testid="input-design-note" className="input min-h-11" value={designNote} onChange={e => setDesignNote(e.target.value)} placeholder={t('A note for the buyer', 'ملاحظة للعميل')} /><Button type="submit" className="btn-primary" disabled={!designFile || submitDesign.isPending || upload.isPending}>{submitDesign.isPending || upload.isPending ? <LoaderCircle size={17} className="animate-spin" /> : <ArrowUpRight size={17} />}{t('Share', 'مشاركة')}</Button></form>
             {order.designChangeNote && <p className="mt-3 rounded-xl bg-accent/10 p-3 text-sm leading-6">{t('Buyer requested: ', 'طلب العميل: ')}{order.designChangeNote}</p>}
             {order.designApprovedAt && <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-900">{t('The buyer approved this design.', 'اعتمد العميل هذا التصميم.')}</p>}
           </section>}
           <section className="surface p-5 md:p-6"><div className="flex items-start justify-between"><div><h2 className="font-display text-lg font-bold">{t('Quote and payments', 'السعر والدفعات')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('Agree on price before starting the work.', 'اتفق على السعر قبل بدء التنفيذ.')}</p></div>{order.status === 'design_review' && order.designApprovedAt && order.review?.decision !== 'changes_requested' && !order.quote && <Button className="btn-outline min-h-9 px-3 py-2 text-xs" onClick={openFinalQuote} data-testid="button-edit-quote">{t('Prepare quote', 'إعداد السعر')}</Button>}</div>
             {order.quote ? <div className="mt-5 rounded-xl bg-secondary/55 p-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{t('Total quote', 'إجمالي السعر')}</span><strong className="font-display text-2xl">{money(order.quote.totalDisplay, order.quote.displayCurrency)}</strong></div><div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-border/70 pt-3 text-sm"><span className="text-muted-foreground">{t('Deposit', 'العربون')} · {formatDepositPercent(order.quote.depositPercent)}</span><strong>{money(order.quote.depositAmountDisplay, order.quote.displayCurrency)}</strong></div><div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{t('Expires', 'ينتهي')} {dateShort(order.quote.expiresAt)}</span><span>{t('Workshop equivalent', 'المعادل بالجنيه')} {money(order.quote.totalEgp)}</span></div></div> : <p className="mt-5 rounded-xl bg-muted p-4 text-sm text-muted-foreground">{order.designApprovedAt ? t('The design is approved. Prepare a quote to continue.', 'تم اعتماد التصميم. أعد السعر للمتابعة.') : t('Share a design and wait for buyer approval before sending a quote.', 'شارك التصميم وانتظر اعتماد العميل قبل إرسال السعر.')}</p>}
          </section>
          <section className="surface p-5 md:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-lg font-bold">{t('Progress', 'التقدم')}</h2><p className="mt-1 text-xs text-muted-foreground">{order.depositReviewPending ? t('Accept the deposited order in workshop review before starting production.', 'اعتمد الطلب المدفوع في مراجعة الورشة قبل بدء التنفيذ.') : t('Let the buyer see the work taking shape.', 'أطلع العميل على تقدم العمل.')}</p></div>{['deposit_paid', 'in_production'].includes(order.status) && <Button className="btn-outline min-h-9 px-3 py-2 text-xs" disabled={order.depositReviewPending} onClick={() => setProgressOpen(true)} data-testid="button-add-progress"><Plus size={15} />{t('Post update', 'إضافة تحديث')}</Button>}</div>
            <ProgressTimeline updates={order.progress || []} />
          </section>
        </>}
      </div>
      <aside className="space-y-5">
        <section className="surface p-5 md:p-6"><h2 className="font-display text-lg font-bold">{t('Order path', 'مسار الطلب')}</h2><OrderSteps order={order} />
          {order.status === 'in_production' && <Button className="btn-primary mt-5 w-full" disabled={markReady.isPending} onClick={() => {
            setFormError('');
            markReady.mutate({ id: order.id }, { onSuccess: () => invalidateOrder(), onError: () => setFormError(tr('Could not mark this order ready. Please try again.', 'تعذر تأكيد الجاهزية. حاول مرة أخرى.')) });
          }} data-testid="button-mark-delivered">{markReady.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <PackageCheck size={17} />}{t('Mark ready for delivery', 'تأكيد الجاهزية للتسليم')}</Button>}
          <div className="mt-5 rounded-xl bg-secondary/70 p-4"><p className="text-xs font-bold text-primary">{t('Private buyer page', 'صفحة العميل الخاصة')}</p><p className="mt-1 break-all text-xs leading-5 text-muted-foreground">{tokenUrl}</p><a href={tokenUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary no-underline">{t('Open buyer page', 'فتح صفحة العميل')}<ExternalLink size={13} /></a></div>
        </section>
        <section className="surface p-5 md:p-6"><h2 className="font-display text-lg font-bold">{t('Payments received', 'الدفعات المستلمة')}</h2>
          {order.payments?.length ? <div className="mt-3 divide-y divide-border">{order.payments.map(pay => <div key={pay.id} className="flex items-center justify-between gap-2 py-3" data-testid={`payment-${pay.id}`}><div><p className="text-sm font-semibold">{pay.type === 'deposit' ? t('Deposit', 'عربون') : t('Balance', 'متبقي')}</p><p className="mt-1 text-xs text-muted-foreground">{dateShort(pay.createdAt)} · {pay.state === 'held' ? t('Held', 'محفوظ') : t('Released', 'تم التحويل')}</p></div><strong className="text-sm">{money(pay.amountDisplay, pay.currency)}</strong></div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">{t('Payments will appear here.', 'ستظهر الدفعات هنا.')}</p>}
        </section>
      </aside>
    </div>
    {formError && <div role="alert" className="fixed bottom-5 start-5 z-40 rounded-xl bg-destructive px-4 py-3 text-sm text-white shadow-lg">{formError}<button onClick={() => setFormError('')} className="ms-3" aria-label={t('Dismiss', 'إغلاق')}><X size={14} /></button></div>}
    {quoteOpen && <OwnerDialog title={t('Prepare a quote', 'إعداد السعر')} lang={lang} onClose={() => setQuoteOpen(false)}>
      <div className="flex items-start justify-between">
        <div><p className="text-xs font-bold uppercase tracking-wider text-accent">{t('A fair agreement', 'اتفاق عادل')}</p><h2 className="font-display mt-1 text-2xl font-extrabold">{t('Prepare a quote', 'إعداد السعر')}</h2></div>
        <button type="button" aria-label={t('Close quote', 'إغلاق السعر')} data-testid="button-close-quote" className="grid h-11 w-11 place-items-center rounded-full bg-secondary" onClick={() => setQuoteOpen(false)}><X size={18} /></button>
      </div>
      <form onSubmit={submitQuote} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Materials · EGP', 'الخامات · جنيه')}><input data-testid="input-materials-cost" className="input" type="number" min="0" step="0.01" required value={quote.materials} onChange={e => setQuote(p => ({ ...p, materials: e.target.value }))} /></Field>
          <Field label={t('Labor · EGP', 'المصنعية · جنيه')}><input data-testid="input-labor-cost" className="input" type="number" min="0" step="0.01" required value={quote.labor} onChange={e => setQuote(p => ({ ...p, labor: e.target.value }))} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Cost markup · %', 'الربح على التكلفة · ٪')}><input data-testid="input-margin-percent" className="input" type="number" min="0" step="0.1" required value={quote.margin} onChange={e => setQuote(p => ({ ...p, margin: e.target.value }))} /></Field>
          <Field label={t('Buyer currency', 'عملة العميل')}><select data-testid="select-quote-currency" className="input" value={quote.currency} onChange={e => { const currency = e.target.value as Currency; setQuote(p => ({ ...p, currency, fx: String(demoFxRates[currency]) })); }}><option value="USD">USD</option><option value="SAR">SAR</option><option value="AED">AED</option><option value="EGP">EGP</option></select></Field>
        </div>
        <Field label={t('Exchange rate · EGP for 1 currency unit', 'سعر الصرف · جنيه لكل وحدة')} hint={t('Demo rate, locked when sent. Actual charges and the ledger are in EGP.', 'سعر تجريبي يُثبّت عند الإرسال. التحصيل والسجل بالجنيه المصري.')}><input data-testid="input-exchange-rate" className="input" type="number" min="0.01" step="0.01" required disabled={quote.currency === 'EGP'} value={quote.fx} onChange={e => setQuote(p => ({ ...p, fx: e.target.value }))} /></Field>
        <Field label={t('Deposit · % of total', 'العربون · نسبة من الإجمالي')}><input data-testid="input-quote-deposit-percent" className="input" type="number" required min="1" max="100" step=".01" value={quote.deposit} onChange={e => setQuote(p => ({ ...p, deposit: e.target.value }))} /></Field>
        <Field label={t('Quote expiry', 'تاريخ انتهاء السعر')}><input data-testid="input-quote-expiry" className="input" type="date" required min={new Date().toISOString().slice(0, 10)} value={quote.expires} onChange={e => setQuote(p => ({ ...p, expires: e.target.value }))} /></Field>
        <div className="rounded-xl bg-secondary/70 p-4">
          <div className="flex justify-between gap-2 text-sm"><span className="text-muted-foreground">{t('Quoted total', 'السعر الإجمالي')}</span><strong data-testid="text-quote-total">{money(totalDisplay, quote.currency)}</strong></div>
          <p className="mt-1 text-xs text-muted-foreground">{money(totalEgp)} {t('before conversion', 'قبل التحويل')}</p>
          <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground"><span>{t('Deposit · chosen percentage', 'العربون · النسبة المحددة')}</span><strong data-testid="text-quote-deposit">{money(depositAmountDisplay, quote.currency)} · {formatDepositPercent(depositPercent / 100)}</strong></div>
        </div>
        <RateWhatIf lang={lang} materials={Number(quote.materials || 0)} labor={Number(quote.labor || 0)} total={totalEgp} />
        {formError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{formError}</p>}
        <Button className="btn-primary w-full" type="submit" disabled={saveQuote.isPending || totalEgp <= 0} data-testid="button-save-quote">{saveQuote.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <Check size={17} />}{t('Share quote with buyer', 'إرسال السعر للعميل')}</Button>
      </form>
    </OwnerDialog>}
    {progressOpen && <OwnerDialog title={t('Post progress', 'إضافة تحديث')} lang={lang} onClose={() => setProgressOpen(false)}>
      <div className="flex items-start justify-between">
        <div><p className="text-xs font-bold uppercase tracking-wider text-accent">{t('A small update goes a long way', 'تحديث صغير يفرق')}</p><h2 className="font-display mt-1 text-2xl font-extrabold">{t('Post progress', 'إضافة تحديث')}</h2></div>
        <button type="button" aria-label={t('Close progress', 'إغلاق التحديث')} className="grid h-11 w-11 place-items-center rounded-full bg-secondary" onClick={() => setProgressOpen(false)}><X size={18} /></button>
      </div>
      <form onSubmit={submitProgress} className="mt-6 space-y-4">
        <Field label={t('Stage', 'المرحلة')}><select data-testid="input-progress-stage" className="input" required value={progress.stage} onChange={e => setProgress(p => ({ ...p, stage: e.target.value }))}>
          <option value="cutting">{t('Cutting', 'تقطيع الخشب')}</option><option value="assembly">{t('Assembly', 'التجميع')}</option><option value="finishing">{t('Finishing', 'التشطيب')}</option><option value="ready">{t('Ready', 'جاهز')}</option>
        </select></Field>
        <Field label={t('Note for buyer', 'ملاحظة للعميل')}><textarea data-testid="input-progress-note" className="input" value={progress.note} onChange={e => setProgress(p => ({ ...p, note: e.target.value }))} placeholder={t('A brief note about what is happening…', 'ملاحظة قصيرة عن المرحلة الحالية...')} /></Field>
        <Field label={t('Take or upload a photo (optional)', 'التقاط أو رفع صورة (اختياري)')} hint={t('JPEG, PNG, WebP, or GIF · under 8 MB. A “ready” update does not mark the order ready; use the separate button.', 'JPEG أو PNG أو WebP أو GIF · أقل من ٨ ميجابايت. تحديث «جاهز» لا يغيّر حالة الطلب؛ استخدم زر تأكيد الجاهزية.')}><input data-testid="input-progress-photo" className="input" type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif" /></Field>
        {formError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{formError}</p>}
        <Button type="submit" className="btn-primary w-full" disabled={postProgress.isPending || upload.isPending} data-testid="button-submit-progress">{postProgress.isPending || upload.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <ArrowUpRight size={17} />}{t('Post update', 'نشر التحديث')}</Button>
      </form>
    </OwnerDialog>}
  </div></AppFrame>;
}
function Detail({ label, value }: { label: string; value: string }) {
  return <div><span className="text-xs font-semibold text-muted-foreground">{label}</span><p className="mt-1 text-sm font-semibold leading-6">{value}</p></div>;
}
function OrderSteps({ order }: { order: Order }) {
  const t = useTranslation();
  const { lang } = useLanguage();
  const steps: [string, string][] = [['Design review', 'مراجعة التصميم'], ['Deposit paid', 'دفع العربون'], ['In the workshop', 'في الورشة'], ['Ready to deliver', 'جاهز للتسليم'], ['Order complete', 'اكتمل الطلب']];
  const active = order.status === 'design_review' && order.designApprovedAt ? 1 : stageIndex[order.status] ?? 0;
  return <div className="relative mt-5 space-y-0">{steps.map(([en, ar], i) => {
    const done = i < active || order.status === 'closed';
    const current = i === active && order.status !== 'closed';
    return <div className="relative flex min-h-[53px] gap-3" key={en}><div className={`z-[1] mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${done ? 'border-primary bg-primary text-primary-foreground' : current ? 'border-accent bg-accent text-white' : 'border-border bg-card text-muted-foreground'}`}>{done ? <Check size={13} /> : <span className="text-[10px] font-bold">{i + 1}</span>}</div><div className={`pt-1 text-sm ${current || done ? 'font-semibold' : 'text-muted-foreground'}`}>{lang === 'ar' ? ar : en}{current && <span className="ms-2 text-[10px] font-bold text-accent">{t('NOW', 'الآن')}</span>}</div>{i < steps.length - 1 && <div className="absolute inset-y-7 start-[11px] w-px bg-border" />}</div>;
  })}</div>;
}
function ProgressTimeline({ updates }: { updates: Order['progress'] }) {
  const t = useTranslation();
  if (!updates.length) return <div className="mt-5 rounded-xl bg-muted/80 p-4 text-sm text-muted-foreground">{t('Work updates shared by the workshop will appear here.', 'ستظهر هنا تحديثات العمل التي تشاركها الورشة.')}</div>;
  return <div className="relative mt-5 space-y-0">{[...updates].reverse().map((u, index) => <div key={u.id} className="relative flex gap-3 pb-5 last:pb-0" data-testid={`progress-update-${u.id}`}><div className="relative z-10 mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-primary"><CheckCircle2 size={14} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-1"><h3 className="text-sm font-bold">{u.stage}</h3><span className="text-[11px] text-muted-foreground">{dateShort(u.createdAt)}</span></div>{u.note && <p className="mt-1 text-sm leading-6 text-muted-foreground">{u.note}</p>}{u.photoUrl && <img src={u.photoUrl} alt={t('Progress photo', 'صورة التقدم')} className="mt-3 max-h-52 w-full rounded-xl object-cover" />}</div>{index < updates.length - 1 && <div className="absolute inset-y-7 start-[11px] w-px bg-border" />}</div>)}</div>;
}

function BuyerPage() {
  const t = useTranslation();
  const { lang } = useLanguage();
  const params = useParams<{ token: string }>();
  const token = params.token || '';
  const queryClient = useQueryClient();
  const query = useGetBuyerOrder(token, { query: { enabled: !!token, queryKey: getGetBuyerOrderQueryKey(token), retry: false } });
  const decide = useDecideOnDesign();
  const payDeposit = usePayDeposit();
  const confirmDelivery = useConfirmDelivery();
  const [comment, setComment] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [paymentTarget, setPaymentTarget] = useState<'deposit' | 'balance' | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentInputMethod>('card');
  const [simulating, setSimulating] = useState(false);
  const order = query.data;
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: getGetBuyerOrderQueryKey(token) }), queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() })]); };
  if (query.isLoading) return <LoadingScreen />;
  if (query.isError || !order) return <AppFrame><div className="mx-auto max-w-lg px-5 py-20 text-center"><Logo /><div className="surface mt-8 p-8"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary"><ShieldCheck size={23} /></div><h1 className="font-display mt-4 text-2xl font-bold">{t('This order link is unavailable', 'رابط الطلب غير متاح')}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{t('Ask the workshop to share the private order link again.', 'اطلب من الورشة مشاركة رابط الطلب الخاص مرة أخرى.')}</p></div></div></AppFrame>;
  const mutateDecision = (decision: 'approve' | 'request_changes') => {
    setDecisionError('');
    if (decision === 'request_changes' && !comment.trim()) {
      setDecisionError(t('Add a short comment so the workshop knows what to change.', 'أضف ملاحظة قصيرة لتوضيح التعديل المطلوب.'));
      return;
    }
    decide.mutate({ token, data: { decision, comment: comment.trim() } }, { onSuccess: refresh, onError: () => setDecisionError(t('Your response could not be saved. Please try again.', 'تعذر حفظ ردك. حاول مرة أخرى.')) });
  };
  const orderClosed = ['closed', 'cancelled', 'expired'].includes(order.status);
  const latestDesign = [...(order.images || [])].reverse().find(img => img.kind === 'design');
  const hasDeposit = order.payments?.some(p => p.type === 'deposit');
  const hasBalance = order.payments?.some(p => p.type === 'balance');
  const allowDesign = order.status === 'design_review' && !order.designApprovedAt;
  const showDeposit = order.quote && !hasDeposit && order.status === 'quoted' && !orderClosed;
  const showBalance = order.status === 'ready' && !hasBalance;
  const paymentPending = simulating || payDeposit.isPending || confirmDelivery.isPending;
  const completePayment = async () => {
    if (!paymentTarget || paymentPending) return;
    setSimulating(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    const vars = { token, data: { method: paymentMethod } };
    const done = async () => { setSimulating(false); await refresh(); setPaymentTarget(null); };
    const failed = () => { setSimulating(false); setDecisionError(t('Payment could not be completed. Please try again.', 'تعذر إتمام الدفع. حاول مرة أخرى.')); };
    if (paymentTarget === 'deposit') payDeposit.mutate(vars, { onSuccess: done, onError: failed });
    else confirmDelivery.mutate(vars, { onSuccess: done, onError: failed });
  };
  return <AppFrame className="bg-background">
    <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 md:px-8"><Logo small /><div className="flex items-center gap-2"><span className="hidden text-xs font-medium text-muted-foreground sm:inline">{t('Secure private order page', 'صفحة طلب خاصة وآمنة')}</span><LanguageToggle /></div></header>
    <div className="page-enter mx-auto max-w-5xl px-5 pb-16 pt-4 md:px-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_310px]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-[24px] bg-primary p-6 text-primary-foreground md:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold"><ShieldCheck size={14} />{t('A clear plan, from sketch to handover', 'خطة واضحة من التصميم حتى التسليم')}</div><p className="text-sm opacity-75">{t('An order from', 'طلب من')} {order.workshopName || order.ownerName}</p><h1 className="font-display mt-2 text-3xl font-extrabold leading-tight md:text-4xl">{order.title}</h1></div><span className={`status-pill ${statusTone(order.status)}`}>{statusNames[order.status]?.[lang === 'ar' ? 1 : 0]}</span></div><p className="mt-4 max-w-xl text-sm leading-7 opacity-80">{order.description || t('Your workshop is keeping each step in one clear place.', 'تتابع ورشتك كل خطوة في مكان واحد واضح.')}</p></section>
          {orderClosed ? <ClosedSummary order={order} /> : <>
            {latestDesign && <section className="surface overflow-hidden"><div className="flex items-center justify-between px-5 py-4 md:px-6"><div><h2 className="font-display font-bold">{t('Design for your review', 'التصميم للمراجعة')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('Take a look and let the workshop know.', 'ألقِ نظرة وأخبر الورشة برأيك.')}</p></div><FileImage size={19} className="text-accent" /></div><a href={latestDesign.url} target="_blank" rel="noreferrer" className="block bg-secondary"><img src={latestDesign.url} alt={t('Order design', 'تصميم الطلب')} className="max-h-[470px] w-full object-contain" /></a>
              {allowDesign && <div className="space-y-4 p-5 md:p-6"><Field label={t('A note for the workshop (optional)', 'ملاحظة للورشة (اختياري)')}><textarea data-testid="input-design-comment" className="input" value={comment} onChange={e => setComment(e.target.value)} placeholder={t('Tell them what you would like adjusted…', 'أخبرهم بما ترغب في تعديله...')} /></Field><div className="flex flex-col gap-2 sm:flex-row"><Button className="btn-primary flex-1" onClick={() => mutateDecision('approve')} disabled={decide.isPending} data-testid="button-approve-design">{decide.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <Check size={17} />}{t('Approve this design', 'اعتماد التصميم')}</Button><Button className="btn-outline flex-1" onClick={() => mutateDecision('request_changes')} disabled={decide.isPending} data-testid="button-request-changes">{t('Request a change', 'طلب تعديل')}</Button></div></div>}
              {!allowDesign && <div className="border-t border-border px-5 py-4 text-sm text-muted-foreground">{order.designApprovedAt ? t('You approved this design. The workshop will prepare your quote next.', 'اعتمدت هذا التصميم. ستجهز الورشة عرض السعر بعد ذلك.') : t('Design shared by the workshop.', 'التصميم المشارك من الورشة.')}</div>}
            </section>}
            {order.quote && <section className="surface p-5 md:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-accent">{t('Your quote', 'عرض السعر')}</p><h2 className="font-display mt-1 text-3xl font-extrabold">{money(order.quote.totalDisplay, order.quote.displayCurrency)}</h2></div><div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-primary"><CreditCard size={20} /></div></div>
              <div className="mt-4 space-y-2 rounded-xl border border-border p-4 text-sm"><div className="flex justify-between gap-3"><span className="text-muted-foreground">{t('Materials', 'الخامات')}</span><span>{money(order.quote.materialsCostEgp / order.quote.fxRateToEgp, order.quote.displayCurrency)}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">{t('Workshop labor', 'مصنعية الورشة')}</span><span>{money(order.quote.laborCostEgp / order.quote.fxRateToEgp, order.quote.displayCurrency)}</span></div><div className="flex justify-between gap-3 border-t border-border pt-2"><span className="text-muted-foreground">{t('Workshop margin', 'هامش الورشة')}</span><span>{order.quote.marginPercent}%</span></div></div>
              <div className="mt-5 rounded-xl bg-secondary/65 p-4"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{t('To begin · deposit', 'لبدء العمل · العربون')}</span><strong>{money(order.quote.depositAmountDisplay, order.quote.displayCurrency)}</strong></div><div className="mt-2 flex items-center justify-between text-sm"><span className="text-muted-foreground">{t('At delivery · balance', 'عند التسليم · المتبقي')}</span><strong>{money(Math.max(0, order.quote.totalDisplay - order.quote.depositAmountDisplay), order.quote.displayCurrency)}</strong></div><p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{t('Once paid, your deposit stays held until you confirm delivery.', 'بعد الدفع، يظل العربون محفوظاً حتى تؤكد استلام الطلب.')}</p></div>
              {showDeposit && <Button className="btn-primary mt-4 w-full" onClick={() => setPaymentTarget('deposit')} data-testid="button-pay-deposit"><WalletCards size={18} />{t('Pay deposit', 'دفع العربون')}</Button>}
              {hasDeposit && !hasBalance && <div className="mt-4 flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-900"><ShieldCheck size={17} />{t('Your deposit is held until you confirm delivery.', 'يُحفظ عربونك حتى تؤكد استلام الطلب.')}</div>}
              <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{t('Locked demo rate', 'سعر الصرف المثبّت')} · 1 {order.quote.displayCurrency} = {order.quote.fxRateToEgp} EGP · {t('Quote valid until', 'السعر صالح حتى')} {dateShort(order.quote.expiresAt)}</p>
            </section>}
            <section className="surface p-5 md:p-6"><div className="flex items-center justify-between"><div><h2 className="font-display text-lg font-bold">{t('Made with care, step by step', 'قطعتك تتشكل بعناية خطوة بخطوة')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('Progress from the workshop', 'تحديثات من الورشة')}</p></div><Hammer size={19} className="text-accent" /></div><OrderSteps order={order} /><div className="mt-3 border-t border-border pt-4"><ProgressTimeline updates={order.progress || []} /></div></section>
            {showBalance && <section className="rounded-2xl border border-accent/30 bg-accent/10 p-5 md:p-6"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-white"><PackageCheck size={19} /></div><div><h2 className="font-display font-bold">{t('Your piece is ready', 'قطعتك جاهزة')}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{t('Review the finished work and settle the balance to confirm delivery.', 'راجع القطعة بعد اكتمالها وسدد المتبقي لتأكيد التسليم.')}</p></div></div><Button className="btn-primary mt-4 w-full" onClick={() => setPaymentTarget('balance')} data-testid="button-pay-balance"><WalletCards size={17} />{t('Pay balance and confirm delivery', 'دفع المتبقي وتأكيد التسليم')}</Button></section>}
            {order.status === 'closed' && <ClosedSummary order={order} />}
          </>}
        </div>
        <aside className="space-y-5">
          <section className="surface p-5"><p className="text-xs font-bold uppercase tracking-wider text-accent">{t('Your workshop', 'ورشتك')}</p><h2 className="font-display mt-2 text-xl font-extrabold">{order.workshopName || order.ownerName}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t('Questions about your piece? Get in touch directly.', 'هل لديك سؤال عن قطعتك؟ تواصل مباشرة مع الورشة.')}</p><a className="btn btn-soft mt-4 w-full" href={whatsappHref(order.ownerPhone, `${t('Hello, I have a question about', 'مرحباً، لدي سؤال بخصوص')} ${order.title}`)} target="_blank" rel="noreferrer" data-testid="link-contact-workshop"><MessageCircle size={17} />{t('Message the workshop', 'مراسلة الورشة')}</a></section>
          <section className="surface p-5"><h2 className="font-display font-bold">{t('Order details', 'تفاصيل الطلب')}</h2><div className="mt-4 space-y-4"><Detail label={t('For', 'العميل')} value={order.buyerName} /><Detail label={t('Country', 'البلد')} value={order.buyerCountry} /><Detail label={t('Dimensions', 'الأبعاد')} value={order.dimensions || '—'} /><Detail label={t('Opened', 'تاريخ الإنشاء')} value={dateShort(order.createdAt)} /></div></section>
        </aside>
      </div>
      {decisionError && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{decisionError}</p>}
    </div>
    {paymentTarget && <div className="modal-backdrop"><div role="dialog" aria-modal="true" className="modal"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-accent">{t('Protected milestone payment', 'دفعة مرحلية محمية')}</p><h2 className="font-display mt-1 text-2xl font-extrabold">{paymentTarget === 'deposit' ? t('Pay your deposit', 'دفع العربون') : t('Settle the balance', 'سداد المتبقي')}</h2></div><button data-testid="button-close-payment" className="grid h-9 w-9 place-items-center rounded-full bg-secondary" onClick={() => setPaymentTarget(null)} disabled={paymentPending}><X size={18} /></button></div>
      <div className="mt-5 rounded-xl bg-primary p-4 text-primary-foreground"><p className="text-xs opacity-75">{paymentTarget === 'deposit' ? t('Due to begin', 'المستحق لبدء العمل') : t('Due at delivery', 'المستحق عند التسليم')}</p><strong className="font-display mt-1 block text-3xl">{money(paymentTarget === 'deposit' ? order.quote?.depositAmountDisplay : Math.max(0, (order.quote?.totalDisplay || 0) - (order.quote?.depositAmountDisplay || 0)), order.quote?.displayCurrency)}</strong></div>
      <div className="mt-5 space-y-3"><p className="text-sm font-semibold">{t('Choose a payment method', 'اختر طريقة الدفع')}</p><button data-testid="button-payment-card" onClick={() => setPaymentMethod('card')} className={`flex w-full items-center gap-3 rounded-xl border p-4 text-start ${paymentMethod === 'card' ? 'border-primary bg-secondary/70' : 'border-border'}`}><CreditCard size={19} className="text-primary" /><span className="flex-1"><strong className="block text-sm">{t('Card', 'بطاقة بنكية')}</strong><small className="text-xs text-muted-foreground">{t('Visa or Mastercard', 'فيزا أو ماستركارد')}</small></span>{paymentMethod === 'card' && <CheckCircle2 size={17} className="text-primary" />}</button><button data-testid="button-payment-wallet" onClick={() => setPaymentMethod('wallet')} className={`flex w-full items-center gap-3 rounded-xl border p-4 text-start ${paymentMethod === 'wallet' ? 'border-primary bg-secondary/70' : 'border-border'}`}><WalletCards size={19} className="text-primary" /><span className="flex-1"><strong className="block text-sm">{t('Digital wallet', 'محفظة إلكترونية')}</strong><small className="text-xs text-muted-foreground">{t('A quick wallet payment', 'دفع سريع بالمحفظة')}</small></span>{paymentMethod === 'wallet' && <CheckCircle2 size={17} className="text-primary" />}</button></div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">{t('This demo simulates payment securely. The workshop only sees the milestone once confirmed.', 'هذه نسخة تجريبية تحاكي الدفع بأمان. ترى الورشة تأكيد المرحلة بعد إتمام الدفع.')}</p><Button className="btn-primary mt-5 w-full" onClick={completePayment} disabled={paymentPending} data-testid="button-confirm-payment">{paymentPending ? <><LoaderCircle size={17} className="animate-spin" />{t('Processing securely…', 'جارٍ إتمام الدفع بأمان...')}</> : <><ShieldCheck size={17} />{t('Confirm simulated payment', 'تأكيد الدفع التجريبي')}</>}</Button></div></div>}
  </AppFrame>;
}
function ClosedSummary({ order }: { order: Order }) {
  const t = useTranslation();
  return <section className="surface p-6 md:p-8"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><CheckCircle2 size={26} /></div><h2 className="font-display mt-4 text-center text-2xl font-extrabold">{order.status === 'cancelled' ? t('This order was cancelled', 'تم إلغاء هذا الطلب') : order.status === 'expired' ? t('This quote has expired', 'انتهت صلاحية عرض السعر') : t('A piece made just for you.', 'قطعة صُنعت خصيصاً لك.')}</h2><p className="mx-auto mt-2 max-w-md text-center text-sm leading-6 text-muted-foreground">{order.status === 'closed' ? t('The order is complete. Thank you for working with', 'اكتمل الطلب. شكراً لثقتك في') + ` ${order.workshopName || order.ownerName}.` : t('Contact the workshop if you have a question about this order.', 'تواصل مع الورشة إذا كان لديك أي سؤال عن الطلب.')}</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-secondary/70 p-4"><span className="text-xs text-muted-foreground">{t('Order', 'الطلب')}</span><p className="mt-1 font-semibold">{order.title}</p></div><div className="rounded-xl bg-secondary/70 p-4"><span className="text-xs text-muted-foreground">{t('Workshop', 'الورشة')}</span><p className="mt-1 font-semibold">{order.workshopName || order.ownerName}</p></div></div>{order.quote && <div className="mt-3 flex items-center justify-between rounded-xl border border-border p-4"><span className="text-sm text-muted-foreground">{t('Final total', 'الإجمالي النهائي')}</span><strong>{money(order.quote.totalDisplay, order.quote.displayCurrency)}</strong></div>}</section>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={LandingPage} />
    <Route path="/owner" component={OwnerHome} />
    <Route path="/owner/orders/new" component={NewOrderPage} />
    <Route path="/owner/orders/:id" component={OrderDetailPage} />
    <Route path="/orders/new" component={NewOrderPage} />
    <Route path="/orders/:id" component={OrderDetailPage} />
    <Route path="/quiz" component={QuizPage} />
    <Route path="/w/reda" component={QuizPage} />
    <Route path="/b/:token">{params => <PublicBuyerPage token={params.token} />}</Route>
    <Route><NotFound /></Route>
  </Switch></ErrorBoundary>;
}
function NotFound() {
  const t = useTranslation();
  return <AppFrame><div className="mx-auto max-w-lg px-5 py-24 text-center"><Logo /><div className="surface mt-8 p-8"><p className="font-display text-5xl font-extrabold text-accent">404</p><h1 className="mt-3 text-xl font-bold">{t('This page is not on the workbench.', 'هذه الصفحة غير موجودة.')}</h1><Link href="/" className="btn btn-primary mt-5">{t('Return to Wasta', 'العودة لوسطى')}</Link></div></div></AppFrame>;
}
function App() {
  const [lang, setLangState] = useState<Language>(() => (localStorage.getItem('wasta-language') as Language) || 'ar');
  const setLang = (next: Language) => { localStorage.setItem('wasta-language', next); setLangState(next); };
  const value = useMemo(() => ({ lang, setLang }), [lang]);
  return <QueryClientProvider client={qc}><TooltipProvider><LanguageContext.Provider value={value}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></LanguageContext.Provider></TooltipProvider></QueryClientProvider>;
}

export default App;
