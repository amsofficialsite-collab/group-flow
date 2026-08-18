(() => {
  if (window.__GROUPFLOW_AGENT_RUNNING__) return;
  window.__GROUPFLOW_AGENT_RUNNING__ = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (el) => !!el && el.getClientRects().length > 0;
  const textOf = (el) => (el?.innerText || el?.textContent || "").trim().toLowerCase();

  async function waitFor(find, timeout = 25000, interval = 350) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = find();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  function normalizeForCompare(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function dedupeCaption(value) {
    const text = String(value || "").replace(/\r\n?/g, "\n").trim();
    if (!text) return "";

    // Facebook sometimes receives the same caption twice: one compact copy
    // followed by the formatted copy. Compare without whitespace so both
    // versions are recognized as duplicates.
    const compactChars = [];
    const originalIndexes = [];
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (/\s/u.test(ch)) continue;
      compactChars.push(ch.toLowerCase());
      originalIndexes.push(i);
    }
    const compact = compactChars.join("");

    // Use a stable text anchor rather than leading emoji/punctuation because
    // Facebook may drop the first emoji in one of the duplicate copies.
    const anchorMatch = compact.match(/[\p{L}\p{N}][\p{L}\p{N}]{17,79}/u);
    if (anchorMatch) {
      const anchor = anchorMatch[0];
      const first = compact.indexOf(anchor);
      const second = compact.indexOf(anchor, first + anchor.length);
      if (second > first + 100) {
        let originalStart = originalIndexes[second] ?? 0;
        // Keep leading emoji/punctuation immediately before the second copy.
        let back = originalStart - 1;
        let steps = 0;
        while (back >= 0 && steps < 12 && !/[\p{L}\p{N}]/u.test(text[back])) {
          originalStart = back;
          if (text[back] === "\n" && steps > 0) break;
          back -= 1;
          steps += 1;
        }
        return text.slice(originalStart).trim();
      }
    }

    // Fallback: find two nearly equal halves after whitespace normalization.
    const midpoint = Math.floor(text.length / 2);
    for (let offset = -250; offset <= 250; offset += 1) {
      const split = midpoint + offset;
      if (split <= 0 || split >= text.length) continue;
      const first = text.slice(0, split).trim();
      const second = text.slice(split).trim();
      const a = normalizeForCompare(first);
      const b = normalizeForCompare(second);
      if (a.length > 200 && (a === b || a.includes(b) || b.includes(a))) {
        return second;
      }
    }

    return text;
  }

  function getCreatePostDialog() {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].filter(visible);
    return dialogs.find((dialog) => {
      const text = textOf(dialog);
      return text.includes("สร้างโพสต์") || text.includes("create post");
    }) || null;
  }

  function composerText(el) {
    return normalizeIdentity(`${textOf(el)} ${el?.getAttribute?.("aria-label") || ""} ${el?.getAttribute?.("title") || ""} ${el?.getAttribute?.("data-ad-preview") || ""}`);
  }

  function looksLikeComposerLauncher(el) {
    if (!visible(el)) return false;
    const text = composerText(el);
    const keywords = [
      "เขียนอะไร", "เขียนโพสต์", "สร้างโพสต์", "สร้างโพสต์สาธารณะ", "คุณกำลังคิดอะไร",
      "โพสต์อะไรบางอย่าง", "เขียนบางอย่าง", "write something", "create post", "create a public post",
      "what's on your mind", "whats on your mind", "post something"
    ];
    if (keywords.some((keyword) => text.includes(keyword))) return true;

    // Facebook frequently renders the group composer as a textbox-looking div
    // instead of a real button. Restrict this fallback to a reasonably sized
    // visible element in the main page so we do not click navigation controls.
    const role = el.getAttribute?.("role") || "";
    const contenteditable = el.getAttribute?.("contenteditable") === "true";
    const rect = el.getBoundingClientRect?.();
    return Boolean((role === "textbox" || contenteditable) && rect && rect.width > 180 && rect.height > 20);
  }

  function findComposerLauncher() {
    const selectors = [
      '[role="button"]', 'button', 'div[tabindex="0"]',
      '[role="textbox"]', '[contenteditable="true"]',
      '[aria-label*="โพสต์"]', '[aria-label*="เขียน"]',
      '[aria-label*="post" i]', '[aria-label*="write" i]'
    ];
    const candidates = [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))]
      .filter(visible);

    const matched = candidates.filter(looksLikeComposerLauncher);
    if (!matched.length) return null;

    // Prefer controls in the center/main content area and avoid header/sidebar.
    return matched.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const as = (ar.top > 80 ? 2 : 0) + (ar.left > window.innerWidth * .12 ? 1 : 0) + Math.min(ar.width, 500) / 500;
      const bs = (br.top > 80 ? 2 : 0) + (br.left > window.innerWidth * .12 ? 1 : 0) + Math.min(br.width, 500) / 500;
      return bs - as;
    })[0] || null;
  }

  async function openComposer(setStatus) {
    let dialog = getCreatePostDialog();
    if (dialog) return dialog;

    const launcher = await waitFor(findComposerLauncher, 30000, 300);
    if (!launcher) {
      throw new Error("ไม่พบช่องสร้างโพสต์ในกลุ่มนี้ — ตรวจว่า Facebook Account/เพจนี้เป็นสมาชิกกลุ่มและมีสิทธิ์โพสต์");
    }

    setStatus("พบช่องสร้างโพสต์แล้ว กำลังเปิด…");
    launcher.scrollIntoView?.({ block: "center", inline: "center" });
    await sleep(300);
    launcher.click();

    dialog = await waitFor(getCreatePostDialog, 12000, 250);
    if (dialog) return dialog;

    // React/Facebook sometimes ignores a synthetic click on the nested node.
    // Retry on the closest clickable ancestor and then use mouse events.
    const clickable = launcher.closest?.('[role="button"],button,[tabindex="0"]') || launcher;
    try { clickable.focus?.(); } catch (_) {}
    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
      try { clickable.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); } catch (_) {}
    }

    dialog = await waitFor(getCreatePostDialog, 10000, 250);
    if (!dialog) {
      throw new Error("Facebook ไม่เปิดหน้าต่างสร้างโพสต์หลังคลิก — อาจเป็นเพราะสิทธิ์ของ Profile/Page ในกลุ่ม หรือ Facebook เปลี่ยนหน้าตา");
    }
    return dialog;
  }

  function findEditor() {
    const dialog = getCreatePostDialog();
    if (!dialog) return null;
    const editors = [...dialog.querySelectorAll('[contenteditable="true"][role="textbox"], [contenteditable="true"]')].filter(visible);
    return editors.find((el) => {
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      return aria.includes("สร้างโพสต์") || aria.includes("create a public post") || aria.includes("เขียน") || aria.includes("post");
    }) || editors[0] || null;
  }

  function formatCaption(rawText) {
    let text = dedupeCaption(rawText)
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (!text) return "";

    // Keep captions that already have useful paragraph breaks.
    const existingBreaks = (text.match(/\n/g) || []).length;
    if (existingBreaks >= 4) return text.replace(/\n{3,}/g, "\n\n");

    const sectionMarkers = [
      "✏️รายละเอียดงาน",
      "🏢สถานที่ทำงาน",
      "💐คุณสมบัติของผู้สมัคร",
      "🌈สวัสดิการ",
      "📌 หมายเหตุ",
      "📌หมายเหตุ",
      "🙋🏻‍♀️ติดต่อสอบถาม",
      "🙋🏻‍♀️ ติดต่อสอบถาม",
      "📣📥ลิ้งค์สำหรับสมัครงาน",
      "📣📥ลิงก์สำหรับสมัครงาน",
      "และโครงการต่าง ๆ อาทิ",
      "และโครงการต่างๆ อาทิ"
    ];
    for (const marker of sectionMarkers) {
      text = text.split(marker).join(`\n\n${marker}\n`);
    }

    // Separate common detail lines without breaking every emoji in normal prose.
    const lineMarkers = [
      "📞 โทรติดตาม", "📞โทรติดตาม",
      "📊ติดตาม", "📊 ติดตาม",
      "👩🏻‍❤️‍👩🏼บริการ", "👩🏻‍❤️‍👩🏼 บริการ",
      "✨อายุ", "✨ อายุ", "✨ไม่จำกัด", "✨ ไม่จำกัด",
      "✨มีประสบการณ์", "✨ มีประสบการณ์", "✨มีใจรัก", "✨ มีใจรัก",
      "✨มีความรับผิดชอบ", "✨ มีความรับผิดชอบ", "✨มีทักษะ", "✨ มีทักษะ",
      "✨เรียนรู้ไว", "✨ เรียนรู้ไว", "✨ชอบการ", "✨ ชอบการ",
      "✨สามารถแก้ไข", "✨ สามารถแก้ไข", "✨รับแรง", "✨ รับแรง",
      "💰 ฐานเงินเดือน", "📈 ปรับขึ้นเงินเดือน", "⏰ ค่าจ้างล่วงเวลา",
      "🏢 ประกันสังคม", "🏥 ประกันสุขภาพ", "🚑 ประกันอุบัติเหตุ",
      "🏦 กองทุนสำรองเลี้ยงชีพ", "💳 เงินกู้ฉุกเฉิน", "💼 เงินฝากสหกรณ์",
      "🌴 วันลาพักร้อน", "🎉", "👕 เสื้อพนักงาน",
      "✈️ สัมมนาประจำปี", "🍚 โครงการ", "🥪 โครงการ", "💪โครงการ", "💪 โครงการ",
      "Line :", "Line:", "FB :", "FB:", "☎️"
    ];
    for (const marker of lineMarkers) {
      text = text.split(marker).join(`\n${marker}`);
    }

    // Improve the opening block.
    text = text
      .replace(/(‼️[^\n]*‼️)/u, "$1\n")
      .replace(/(🚜[^\n]*🚜)/u, "$1\n")
      .replace(/(👩🏻‍💻[^\n]*👩🏻‍💻)/u, "$1\n")
      .replace(/(💰[^\n]*💰)/u, "$1\n")
      .replace(/(🎯[^\n]*📈)/u, "$1\n");

    return text
      .replace(/^\s*\n+/, "")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeIdentity(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findIdentityControl(dialog) {
    const roots = dialog ? [dialog, document] : [document];
    const keywords = ["โพสต์ในนาม", "กำลังโพสต์ในนาม", "posting as", "post as", "switch profile", "เปลี่ยนโปรไฟล์"];

    for (const root of roots) {
      const candidates = [...root.querySelectorAll('button, [role="button"], [aria-label], [title], div[tabindex="0"]')].filter(visible);
      const direct = candidates.find((el) => {
        const combined = normalizeIdentity(`${textOf(el)} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`);
        return keywords.some((keyword) => combined.includes(keyword));
      });
      if (direct) return direct;
    }

    if (dialog) {
      const headerButtons = [...dialog.querySelectorAll('button, [role="button"], div[tabindex="0"]')].filter(visible);
      return headerButtons.find((el) => {
        const img = el.querySelector("img");
        if (!img) return false;
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight * 0.55 && rect.width <= 120;
      }) || null;
    }
    return null;
  }

  function findIdentityOption(identity) {
    const wanted = normalizeIdentity(identity);
    if (!wanted) return null;
    const roots = [...document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]'), document];

    for (const root of roots) {
      const candidates = [...root.querySelectorAll('[role="menuitem"], [role="option"], button, [role="button"], div[tabindex="0"]')].filter(visible);
      const exact = candidates.find((el) => normalizeIdentity(textOf(el)) === wanted);
      if (exact) return exact;
      const contains = candidates.find((el) => {
        const text = normalizeIdentity(textOf(el));
        return text && (text.includes(wanted) || wanted.includes(text));
      });
      if (contains) return contains;
    }
    return null;
  }

  async function switchPostingIdentity(identity, setStatus) {
    const wanted = String(identity || "").trim();
    if (!wanted) return;

    const dialog = getCreatePostDialog();
    const control = findIdentityControl(dialog);
    if (!control) {
      throw new Error(`ไม่พบปุ่มสลับตัวตนสำหรับโพสต์ในนาม “${wanted}” กรุณาตรวจว่าเพจเป็นสมาชิกกลุ่มและกลุ่มอนุญาตให้เพจโพสต์`);
    }

    setStatus(`กำลังเลือกโพสต์ในนาม “${wanted}”…`);
    control.click();
    await sleep(900);

    const option = await waitFor(() => findIdentityOption(wanted), 12000, 350);
    if (!option) {
      throw new Error(`ไม่พบเพจ “${wanted}” ในรายการตัวตนของ Facebook กรุณาใช้ชื่อเพจให้ตรงกับที่ Facebook แสดง`);
    }

    option.click();
    await sleep(1200);
    await waitFor(() => getCreatePostDialog(), 8000, 300);
    setStatus(`เลือกโพสต์ในนาม “${wanted}” แล้ว`);
  }

  async function replaceEditorText(editor, rawText) {
    const text = formatCaption(rawText);
    editor.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("delete", false);

    const escapeHtml = (value) => String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const html = lines
      .map((line) => line ? `<div>${escapeHtml(line)}</div>` : "<div><br></div>")
      .join("");

    const inserted = document.execCommand("insertHTML", false, html);

    if (!inserted || !normalizeForCompare(editor.innerText || editor.textContent || "")) {
      editor.replaceChildren();
      for (const line of lines) {
        const block = document.createElement("div");
        if (line) block.textContent = line;
        else block.appendChild(document.createElement("br"));
        editor.appendChild(block);
      }
    }

    editor.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertFromPaste",
      data: text
    }));
    editor.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

    await sleep(700);
    return text;
  }

  function normalizeImageUrls(job) {
    const urls = Array.isArray(job?.imageUrls) && job.imageUrls.length
      ? job.imageUrls
      : job?.imageUrl
        ? [job.imageUrl]
        : [];
    return [...new Set(urls.filter((url) => typeof url === "string" && url.trim()))];
  }

  function requestImages(urls) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "GROUPFLOW_FETCH_IMAGES", urls }, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.ok) return reject(new Error(response?.error || "ดาวน์โหลดรูปไม่สำเร็จ"));
        resolve(response.images || []);
      });
    });
  }

  function dataUrlToFile(dataUrl, type, index) {
    const [header, base64] = dataUrl.split(",");
    if (!header || !base64) throw new Error(`ข้อมูลรูปที่ ${index + 1} ไม่ถูกต้อง`);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const mime = type || header.match(/data:([^;]+)/)?.[1] || "image/jpeg";
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
    return new File([bytes], `group-flow-${Date.now()}-${index + 1}.${ext}`, { type: mime });
  }

  function findImageInput(dialog = getCreatePostDialog()) {
    const roots = dialog ? [dialog, document] : [document];
    for (const root of roots) {
      const inputs = [...root.querySelectorAll('input[type="file"]')]
        .filter((el) => !el.disabled);
      const preferred = inputs.find((el) => {
        const accept = (el.accept || "").toLowerCase();
        return accept.includes("image") && el.multiple;
      });
      if (preferred) return preferred;
      const anyImage = inputs.find((el) => (el.accept || "").toLowerCase().includes("image"));
      if (anyImage) return anyImage;
    }
    return null;
  }

  function countAttachedImages(dialog = getCreatePostDialog()) {
    if (!dialog) return 0;
    const imageCount = [...dialog.querySelectorAll("img")].filter((img) => {
      const src = img.currentSrc || img.src || "";
      const rect = img.getBoundingClientRect();
      return visible(img) && src && rect.width >= 60 && rect.height >= 60;
    }).length;
    const removeCount = [...dialog.querySelectorAll('[aria-label], [role="button"]')].filter((el) => {
      const label = `${el.getAttribute("aria-label") || ""} ${textOf(el)}`.toLowerCase();
      return visible(el) && (label.includes("ลบรูป") || label.includes("remove photo") || label.includes("remove image"));
    }).length;
    return Math.max(imageCount, removeCount);
  }

  async function attachImages(imageUrls, setStatus) {
    if (!imageUrls.length) return;

    setStatus(`กำลังดาวน์โหลดรูป 0/${imageUrls.length}…`);
    const imageData = await requestImages(imageUrls);
    if (imageData.length !== imageUrls.length) throw new Error("ดาวน์โหลดรูปมาไม่ครบ");
    const files = imageData.map((item, index) => dataUrlToFile(item.dataUrl, item.type, index));

    const dialog = getCreatePostDialog();
    if (!dialog) throw new Error("ไม่พบหน้าต่างสร้างโพสต์");

    const photoButton = [...dialog.querySelectorAll('[role="button"], button, div[tabindex="0"]')]
      .filter(visible)
      .find((el) => {
        const combined = `${textOf(el)} ${(el.getAttribute("aria-label") || "").toLowerCase()}`;
        return combined.includes("รูปภาพ/วิดีโอ") || combined.includes("รูปภาพ") || combined.includes("photo/video") || combined.includes("photo");
      });

    async function getInput(forceOpen = false) {
      let input = findImageInput(dialog);
      if ((!input || forceOpen) && photoButton) {
        photoButton.click();
        await sleep(700);
        input = await waitFor(() => findImageInput(getCreatePostDialog()), 12000);
      }
      return input;
    }

    async function assignFiles(input, selectedFiles) {
      input.setAttribute("multiple", "");
      input.multiple = true;
      const transfer = new DataTransfer();
      selectedFiles.forEach((file) => transfer.items.add(file));
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
      if (setter) setter.call(input, transfer.files);
      else Object.defineProperty(input, "files", { value: transfer.files, configurable: true });
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      await sleep(1800);
    }

    let input = await getInput(true);
    if (!input) throw new Error("ไม่พบช่องอัปโหลดรูปของ Facebook");

    setStatus(`กำลังเพิ่มรูป ${files.length} รูป…`);
    await assignFiles(input, files);

    // Facebook may accept all files before all preview thumbnails appear.
    // Do not append files again, otherwise duplicate photos are created.
    setStatus(`กำลังอัปโหลดรูป ${files.length} รูป…`);

    const ready = await waitFor(() => {
      const dialogNow = getCreatePostDialog();
      if (!dialogNow) return null;
      return countAttachedImages(dialogNow) > 0 ? true : null;
    }, Math.max(60000, files.length * 20000), 500);

    if (!ready) throw new Error("Facebook ยังไม่แสดงตัวอย่างรูป");

    await sleep(Math.max(4000, files.length * 1600));
  }

  function findPostButton() {
    const dialog = getCreatePostDialog();
    if (!dialog) return null;
    const buttons = [...dialog.querySelectorAll('button, [role="button"]')].filter(visible);
    return buttons.find((el) => {
      const disabled = el.disabled || el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
      if (disabled) return false;
      const text = textOf(el);
      const aria = (el.getAttribute("aria-label") || "").trim().toLowerCase();
      return text === "โพสต์" || text === "post" || aria === "โพสต์" || aria === "post";
    }) || null;
  }

  function showPanel(job) {
    document.getElementById("groupflow-agent-panel")?.remove();
    const panel = document.createElement("div");
    panel.id = "groupflow-agent-panel";
    panel.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483647;width:360px;background:#10131a;color:white;border:1px solid #3b82f6;border-radius:16px;padding:16px;font-family:Arial,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.45)";
    panel.innerHTML = `
      <div style="font-weight:700;font-size:17px">GROUP FLOW Posting Agent V13.4</div>
      <div style="margin-top:6px;font-size:12px;color:#93c5fd">${job.groupName || "Facebook Group"}</div>
      <div id="gf-status" style="margin-top:10px;font-size:13px;line-height:1.5;color:#e2e8f0">กำลังเตรียมโพสต์…</div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button id="gf-post" style="display:none;flex:1;padding:10px;border:0;border-radius:10px;background:#2563eb;color:white;font-weight:700;cursor:pointer">กดโพสต์</button>
        <button id="gf-fail" style="padding:10px;border:1px solid #475569;border-radius:10px;background:#1e293b;color:white;cursor:pointer">ยกเลิกทั้งหมด</button>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector("#gf-fail").onclick = () => {
      chrome.runtime.sendMessage({ type: "GROUPFLOW_FINISH_JOB", result: "failed", notes: "ผู้ใช้ยกเลิกจาก Posting Agent" });
      panel.remove();
    };
    return panel;
  }

  async function run(job) {
    const panel = showPanel(job);
    const status = panel.querySelector("#gf-status");
    const manualPost = panel.querySelector("#gf-post");
    const setStatus = (message) => { status.textContent = message; };

    try {
      setStatus("กำลังค้นหาช่องสร้างโพสต์ของ Facebook…");
      let dialog = await openComposer(setStatus);

      if (job.postingIdentity) {
        await switchPostingIdentity(job.postingIdentity, setStatus);
        dialog = getCreatePostDialog() || dialog;
      }

      const editor = await waitFor(findEditor, 12000);
      if (!editor) throw new Error("ไม่พบช่องเขียนข้อความในหน้าต่างสร้างโพสต์");

      setStatus("กำลังใส่ข้อความ…");
      const finalCaption = await replaceEditorText(editor, job.caption || "");
      await sleep(1200);

      const expected = normalizeForCompare(finalCaption).slice(0, 15);
      const actual = normalizeForCompare(editor.innerText || editor.textContent || "");
      if (expected && !actual.includes(expected)) throw new Error("Facebook ไม่รับข้อความอัตโนมัติ");

      const imageUrls = normalizeImageUrls(job);
      if (imageUrls.length) await attachImages(imageUrls, setStatus);

      setStatus("กำลังรอปุ่มโพสต์…");
      const postButton = await waitFor(findPostButton, 40000);
      if (!postButton) throw new Error("ไม่พบปุ่มโพสต์ หรือ Facebook ยังอัปโหลดรูปไม่เสร็จ");

      if (job.autoPost) {
        setStatus("กำลังกดโพสต์อัตโนมัติ…");
        await sleep(1000);
        postButton.click();
        await sleep(4000);
        chrome.runtime.sendMessage({ type: "GROUPFLOW_FINISH_JOB", result: "posted", postUrl: location.href, notes: "โพสต์อัตโนมัติจาก GROUP FLOW Posting Agent V13.4" });
        setStatus("ส่งคำสั่งโพสต์แล้ว และบันทึกผลกลับ GROUP FLOW แล้ว");
      } else {
        setStatus("เตรียมโพสต์เรียบร้อย กรุณาตรวจสอบแล้วกดปุ่มด้านล่าง");
        manualPost.style.display = "block";
        manualPost.onclick = async () => {
          const latestButton = findPostButton();
          if (!latestButton) return alert("ไม่พบปุ่มโพสต์ค่ะ");
          latestButton.click();
          setStatus("กำลังโพสต์…");
          await sleep(4000);
          chrome.runtime.sendMessage({ type: "GROUPFLOW_FINISH_JOB", result: "posted", postUrl: location.href, notes: "ผู้ใช้ตรวจสอบและกดโพสต์ผ่าน Posting Agent V13.4" });
        };
      }
    } catch (error) {
      setStatus(`หยุดทำงาน: ${error?.message || String(error)}`);
      chrome.runtime.sendMessage({ type: "GROUPFLOW_FINISH_JOB", result: "failed", notes: error?.message || String(error) });
    }
  }

  chrome.runtime.sendMessage({ type: "GROUPFLOW_GET_JOB" }, (response) => {
    const job = response?.job;
    if (!job) {
      window.__GROUPFLOW_AGENT_RUNNING__ = false;
      return;
    }
    const current = location.href.split("?")[0].replace(/\/$/, "");
    const target = String(job.groupUrl || "").split("?")[0].replace(/\/$/, "");
    if (target && !current.startsWith(target) && !target.startsWith(current)) {
      window.__GROUPFLOW_AGENT_RUNNING__ = false;
      return;
    }
    setTimeout(() => run(job), 1200);
  });
})();
