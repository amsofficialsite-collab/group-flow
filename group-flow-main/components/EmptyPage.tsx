import AppShell from "./AppShell";
export default function EmptyPage({ title, text }: { title: string; text: string }) {
  return <AppShell title={title}><div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 text-white/50">{text}</p></div></AppShell>;
}
