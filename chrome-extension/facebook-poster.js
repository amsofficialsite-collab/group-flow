(() => {
  if (window.__GROUPFLOW_POSTER_LOADED__) return;
  window.__GROUPFLOW_POSTER_LOADED__ = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const textOf = (el) => (el?.innerText || el?.textContent || "").trim().toLowerCase();
  const visible = (el) => !!el && el.getClientRects().length > 0;

  async function waitFor(find, timeout = 20000, interval = 400) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = find();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  function findComposerLauncher() {
    const candidates = [...document.querySelectorAll('[role="button"], div[tabindex="0"]')].filter(visible);
    return candidates.find((el) => {
      const t = textOf(el);
      return t.includes("เขียนอะไร") || t.includes("สร้างโพสต์") || t.includes("write something") || t.includes("create post");
    });
  }

  function findComposerDialog() {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
      .filter(visible);

    const matched = dialogs.find((dialog) => {
      const text = textOf(dialog);
      return text.includes("สร้างโพสต์") || text.includes("create post");
    });

    return matched || dialogs.at(-1) || null;
  }

  function findEditable(root = findComposerDialog()) {
    if (!root) return null;

    const editors = [...root.querySelectorAll(
      '[contenteditable="true"][role="textbox"], div[contenteditable="true"]'
    )].filter(visible);

    return editors.find((el) => {
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const placeholder = (el.getAttribute("data-placeholder") || "").toLowerCase();
      const combined = `${aria} ${placeholder}`;
      return (
        combined.includes("สร้างโพสต์") ||
        combined.includes("เขียน") ||
        combined.includes("create") ||
        combined.includes("write") ||
        combined.includes("post") ||
        editors.length === 1
      );
    }) || editors[0] || null;
  }

  async function setEditableText(el, text) {
    if (!text) return;

    el.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);

    document.execCommand("delete", false);
    const inserted = document.execCommand("insertText", false, text);

    el.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertText",
      data: null,
    }));

    await sleep(600);

    if (!inserted || !textOf(el)) {
      el.focus();
      el.textContent = text;
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: text,
      }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(600);
    }

    if (!textOf(el)) {
      throw new Error("ใส่ข้อความในช่องโพสต์ไม่สำเร็จ");
    }
  }

  function normalizeImageUrls(job) {
    const urls = Array.isArray(job?.imageUrls) && job.imageUrls.length
      ? job.imageUrls
      : job?.imageUrl
        ? [job.imageUrl]
        : [];
    return [...new Set(urls.filter((url) => typeof url === "string" && url.trim()))];
  }

  async function attachImages(imageUrls, root = findComposerDialog()) {
    if (!imageUrls.length) return true;

    const files = [];
    for (let index = 0; index < imageUrls.length; index += 1) {
      const response = await fetch(imageUrls[index]);
      if (!response.ok) throw new Error(`ดาวน์โหลดรูปที่ ${index + 1} ไม่สำเร็จ`);

      const blob = await response.blob();
      const ext = blob.type.includes("png")
        ? "png"
        : blob.type.includes("webp")
          ? "webp"
          : blob.type.includes("gif")
            ? "gif"
            : "jpg";

      files.push(new File(
        [blob],
        `group-flow-${Date.now()}-${index + 1}.${ext}`,
        { type: blob.type || "image/jpeg" },
      ));
    }

    const searchRoot = root || document;

    let input = [...searchRoot.querySelectorAll('input[type="file"]')]
      .find((el) => !el.disabled && (el.accept || "").toLowerCase().includes("image"));

    if (!input) {
      const photoButton = [...searchRoot.querySelectorAll('[role="button"], button, div[tabindex="0"]')]
        .filter(visible)
        .find((el) => {
          const t = textOf(el);
          const aria = (el.getAttribute("aria-label") || "").toLowerCase();
          return t.includes("รูปภาพ/วิดีโอ") || t.includes("รูปภาพ") || t.includes("photo/video") || aria.includes("photo") || aria.includes("รูปภาพ");
        });

      if (photoButton) photoButton.click();

      input = await waitFor(() => [...searchRoot.querySelectorAll('input[type="file"]')]
        .find((el) => !el.disabled && (el.accept || "").toLowerCase().includes("image")), 10000);
    }

    if (!input) throw new Error("ไม่พบช่องอัปโหลดรูปของ Facebook");

    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));

    Object.defineProperty(input, "files", {
      value: transfer.files,
      configurable: true,
    });

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await sleep(Math.max(5000, files.length * 2200));
    return true;
  }

  function findPostButton() {
    const composerDialog = findComposerDialog();
    const roots = composerDialog ? [composerDialog] : [document.body];

    for (const root of roots) {
      const candidates = [...root.querySelectorAll('button, [role="button"], div[tabindex="0"]')].filter(visible);
      const button = candidates.find((el) => {
        const t = textOf(el);
        const aria = (el.getAttribute("aria-label") || "").trim().toLowerCase();
        const disabled = el.getAttribute("aria-disabled") === "true" || el.hasAttribute("disabled") || el.disabled === true;
        return !disabled && (t === "โพสต์" || t === "post" || aria === "โพสต์" || aria === "post");
      });
      if (button) return button;
    }

    return null;
  }

  function showPanel() {
    const existing = document.getElementById("groupflow-agent-panel");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "groupflow-agent-panel";
    panel.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483647;width:340px;background:#10131a;color:white;border:1px solid #3b82f6;border-radius:16px;padding:16px;font-family:Arial,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.45)";
    panel.innerHTML = `
      <div style="font-weight:700;font-size:16px">GROUP FLOW Posting Agent</div>
      <div id="gf-status" style="margin-top:8px;font-size:13px;color:#cbd5e1">กำลังเตรียมโพสต์…</div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button id="gf-post" style="display:none;flex:1;padding:10px;border:0;border-radius:10px;background:#2563eb;color:white;font-weight:700;cursor:pointer">กดโพสต์</button>
        <button id="gf-fail" style="padding:10px;border:1px solid #475569;border-radius:10px;background:#1e293b;color:white;cursor:pointer">ยกเลิก</button>
      </div>`;

    document.body.appendChild(panel);
    panel.querySelector("#gf-fail").onclick = () => chrome.runtime.sendMessage({
      type: "GROUPFLOW_FINISH_JOB",
      result: "failed",
      notes: "ผู้ใช้ยกเลิกจาก Posting Agent",
    });
    return panel;
  }

  async function run(job) {
    const runKey = `groupflow_running_${job.queueId || "unknown"}`;
    if (sessionStorage.getItem(runKey) === "1") return;
    sessionStorage.setItem(runKey, "1");

    const panel = showPanel();
    const status = panel.querySelector("#gf-status");
    const manualPost = panel.querySelector("#gf-post");

    try {
      status.textContent = "กำลังเปิดหน้าสร้างโพสต์…";
      const launcher = await waitFor(findComposerLauncher, 25000);
      if (launcher) launcher.click();

      const composerDialog = await waitFor(findComposerDialog, 20000);
      if (!composerDialog) throw new Error("ไม่พบหน้าต่างสร้างโพสต์");

      const editor = await waitFor(() => findEditable(composerDialog), 20000);
      if (!editor) throw new Error("ไม่พบช่องเขียนโพสต์ กรุณาเปิดหน้า Facebook Group ที่สามารถโพสต์ได้");

      status.textContent = "กำลังใส่ข้อความ…";
      await setEditableText(editor, job.caption || "");

      const imageUrls = normalizeImageUrls(job);
      if (imageUrls.length > 0) {
        status.textContent = `กำลังแนบรูปภาพ ${imageUrls.length} รูป…`;
        await attachImages(imageUrls, composerDialog);
        status.textContent = `แนบรูปภาพครบ ${imageUrls.length} รูปแล้ว`;
      }

      status.textContent = "กำลังรอ Facebook เตรียมปุ่มโพสต์…";
      const postButton = await waitFor(findPostButton, 30000);
      if (!postButton) throw new Error("ไม่พบปุ่มโพสต์ กรุณาตรวจสอบว่าหน้าต่างสร้างโพสต์เปิดอยู่และรูปอัปโหลดเสร็จแล้ว");

      if (job.autoPost) {
        status.textContent = "กำลังกดโพสต์อัตโนมัติ…";
        await sleep(1200);
        postButton.click();
        await sleep(3500);
        chrome.runtime.sendMessage({
          type: "GROUPFLOW_FINISH_JOB",
          result: "posted",
          postUrl: location.href,
          notes: "โพสต์อัตโนมัติจาก GROUP FLOW Posting Agent",
        });
        status.textContent = "ส่งคำสั่งโพสต์แล้ว และบันทึกผลกลับ GROUP FLOW แล้ว";
      } else {
        status.textContent = "เตรียมโพสต์เรียบร้อย กรุณาตรวจสอบแล้วกดปุ่มด้านล่าง";
        manualPost.style.display = "block";
        manualPost.onclick = async () => {
          const latestButton = findPostButton();
          if (!latestButton) return alert("ไม่พบปุ่มโพสต์ค่ะ");
          latestButton.click();
          status.textContent = "กำลังโพสต์…";
          await sleep(3500);
          chrome.runtime.sendMessage({
            type: "GROUPFLOW_FINISH_JOB",
            result: "posted",
            postUrl: location.href,
            notes: "ผู้ใช้ตรวจสอบและกดโพสต์ผ่าน Posting Agent",
          });
        };
      }
    } catch (error) {
      sessionStorage.removeItem(runKey);
      status.textContent = `หยุดทำงาน: ${error.message}`;
      chrome.runtime.sendMessage({
        type: "GROUPFLOW_FINISH_JOB",
        result: "failed",
        notes: error.message,
      });
    }
  }

  chrome.runtime.sendMessage({ type: "GROUPFLOW_GET_JOB" }, (response) => {
    const job = response?.job;
    if (!job) return;

    const normalizedCurrent = location.href.split("?")[0].replace(/\/$/, "");
    const normalizedTarget = job.groupUrl.split("?")[0].replace(/\/$/, "");
    if (!normalizedCurrent.startsWith(normalizedTarget) && !normalizedTarget.startsWith(normalizedCurrent)) return;

    setTimeout(() => run(job), 1200);
  });
})();
