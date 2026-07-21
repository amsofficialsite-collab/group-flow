import AppShell from "@/components/AppShell";
export default function Page(){ return <AppShell title="Settings"><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"><h2 className="font-semibold">Supabase Connection</h2><p className="mt-2 text-sm text-white/55">คัดลอกไฟล์ .env.example เป็น .env.local แล้วใส่ Project URL และ Publishable Key</p></div></AppShell>; }
