const menu = [
  ["▦", "Dashboard", true],
  ["◎", "Groups", false],
  ["✦", "Content Library", false],
  ["⌁", "AI Generator", false],
  ["◷", "Daily Queue", false],
  ["✓", "Posting History", false],
  ["⚙", "Settings", false],
] as const;

const cards = [
  ["กลุ่มทั้งหมด", "0", "พร้อมเพิ่มรายชื่อกลุ่ม"],
  ["คิววันนี้", "0", "ยังไม่มีโพสต์ที่ตั้งไว้"],
  ["โพสต์สำเร็จ", "0", "วันนี้"],
  ["รอดำเนินการ", "0", "ตรวจสอบก่อนโพสต์"],
] as const;

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span>GF</span><div><strong>GROUP FLOW</strong><small>Posting workspace</small></div></div>
        <nav>
          {menu.map(([icon, label, active]) => (
            <button className={active ? "navItem active" : "navItem"} key={label}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="sidebarFoot">
          <div className="statusDot" />
          <div><strong>System ready</strong><small>V1 Foundation</small></div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p>Workspace</p><h1>ภาพรวมการโพสต์</h1></div>
          <button className="primary">+ สร้างโพสต์ใหม่</button>
        </header>

        <section className="hero">
          <div>
            <span className="eyebrow">GROUP FLOW V1</span>
            <h2>จัดคิวคอนเทนต์สำหรับ Facebook Group<br />ให้เป็นระบบในที่เดียว</h2>
            <p>เวอร์ชันเริ่มต้นที่สะอาด พร้อม Deploy และพร้อมเชื่อม Supabase ในเวอร์ชันถัดไป</p>
          </div>
          <div className="heroBadge"><b>0</b><span>โพสต์วันนี้</span></div>
        </section>

        <section className="stats">
          {cards.map(([title, value, note]) => (
            <article className="card" key={title}>
              <p>{title}</p><strong>{value}</strong><small>{note}</small>
            </article>
          ))}
        </section>

        <section className="grid">
          <article className="panel">
            <div className="panelHead"><div><p>Daily Queue</p><h3>คิวโพสต์วันนี้</h3></div><button>ดูทั้งหมด</button></div>
            <div className="empty"><div>◷</div><h4>ยังไม่มีคิวโพสต์</h4><p>เพิ่มกลุ่มและคอนเทนต์ แล้วจัดตารางโพสต์ได้ที่นี่</p><button className="secondary">เริ่มตั้งค่าระบบ</button></div>
          </article>
          <article className="panel compact">
            <div className="panelHead"><div><p>Quick start</p><h3>ขั้นตอนถัดไป</h3></div></div>
            <ol>
              <li><span>1</span><div><b>เชื่อม Supabase</b><small>สร้างตารางและระบบ Login</small></div></li>
              <li><span>2</span><div><b>เพิ่ม Facebook Groups</b><small>บันทึกลิงก์ หมวด และสถานะ</small></div></li>
              <li><span>3</span><div><b>สร้าง Content Library</b><small>เก็บข้อความ รูป และเวอร์ชันโพสต์</small></div></li>
            </ol>
          </article>
        </section>
      </section>
    </main>
  );
}
