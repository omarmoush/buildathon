import { Route, Switch } from "wouter";

// Handoff shell only. Person 2/3 replace these placeholders with their own pages.
// The existing artifacts/wasta frontend is deliberately not modified.
function Placeholder({ title }: { title: string }) {
  return <main dir="rtl" className="mx-auto max-w-lg p-6"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-3">هذه الصفحة قيد التطوير.</p></main>;
}
export default function App() {
  return <Switch>
    <Route path="/quiz"><Placeholder title="اختر قطعتك" /></Route>
    <Route path="/w/reda"><Placeholder title="ورشة رضا" /></Route>
    <Route path="/b/:token"><Placeholder title="متابعة طلبك" /></Route>
    <Route path="/owner/*"><Placeholder title="إدارة الورشة" /></Route>
    <Route><Placeholder title="Wasta" /></Route>
  </Switch>;
}
