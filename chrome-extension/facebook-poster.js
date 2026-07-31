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

  function findComposerLauncher() {
    const candidates = [...document.querySelectorAll('[role="button"], button, div[tabindex="0"]')].filter(visible);
    return candidates.find((el) => {
      const combined = `${textOf(el)} ${(el.getAttribute("aria-label") || "").toLowerCase()}`;
      return combined.includes("เขียนอะไร") || combined.includes("สร้างโพสต์") || combined.includes("write something") || combined.includes("create post");
    }) || null;
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

  async function replaceEditorText(editor, rawText) {
    const text = formatCaption(rawText);
    editor.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("delete", false);

    // Facebook มักยุบการขึ้นบรรทัดเมื่อส่งข้อความทั้งก้อนด้วย insertText
    // จึงแยกพิมพ์ทีละบรรทัดและสั่ง line break จริงใน contenteditable
    const lines = text.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line) {
        const inserted = document.execCommand("insertText", false, line);
        if (!inserted) {
          throw new Error(`Facebook ไม่รับข้อความบรรทัดที่ ${index + 1}`);
        }
      }

      if (index < lines.length - 1) {
        const brokeLine =
          document.execCommand("insertLineBreak", false) ||
          document.execCommand("insertParagraph", false);
        if (!brokeLine) {
          throw new Error(`Facebook ไม่รับคำสั่งขึ้นบรรทัดใหม่ที่ ${index + 1}`);
        }
      }

      // เว้นจังหวะเล็กน้อยให้ React/Facebook บันทึกแต่ละบรรทัดทัน
      if (index > 0 && index % 12 === 0) await sleep(25);
    }

    editor.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertText",
      data: null
    }));
    editor.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

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

    async function getInput() {
      let input = findImageInput(dialog);
      if (!input && photoButton) {
        photoButton.click();
        await sleep(700);
        input = await waitFor(() => findImageInput(dialog), 12000);
      }
      return input;
    }

    async function assignFiles(input, selectedFiles) {
      const transfer = new DataTransfer();
      selectedFiles.forEach((file) => transfer.items.add(file));
      const filesSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
      if (filesSetter) filesSetter.call(input, transfer.files);
      else Object.defineProperty(input, "files", { value: transfer.files, configurable: true });
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return input.files?.length || 0;
    }

    let input = await getInput();
    if (!input) throw new Error("ไม่พบช่องอัปโหลดรูปของ Facebook");

    // First try sending every image in one selection.
    let accepted = await assignFiles(input, files);

    // Some Facebook layouts expose a single-file input. In that case, add images one-by-one.
    if (accepted < files.length && files.length > 1) {
      for (let i = accepted; i < files.length; i += 1) {
        setStatus(`กำลังเพิ่มรูป ${i + 1}/${files.length}…`);
        input = await getInput();
        if (!input) throw new Error(`ไม่พบช่องอัปโหลดสำหรับรูปที่ ${i + 1}`);
        const count = await assignFiles(input, [files[i]]);
        if (count < 1) throw new Error(`Facebook ไม่รับรูปที่ ${i + 1}`);
        await sleep(1200);
      }
    }

    setStatus(`กำลังอัปโหลดรูป ${files.length} รูป…`);

    // Require at least the requested number of visible previews where possible.
    const previewReady = await waitFor(() => {
      const currentDialog = getCreatePostDialog();
      if (!currentDialog) return null;
      const images = [...currentDialog.querySelectorAll('img')].filter((img) => {
        const src = img.currentSrc || img.src || "";
        const rect = img.getBoundingClientRect();
        return src && rect.width >= 70 && rect.height >= 70;
      });
      return images.length >= files.length ? images : null;
    }, Math.max(45000, files.length * 15000), 500);

    if (!previewReady) {
      throw new Error(`Facebook แสดงรูปไม่ครบ กรุณาตรวจสอบ (${files.length} รูป)`);
    }

    await sleep(Math.max(3000, files.length * 1200));
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
      <div style="font-weight:700;font-size:17px">GROUP FLOW Posting Agent V8</div>
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
      setStatus("กำลังเปิดหน้าสร้างโพสต์…");
      let dialog = getCreatePostDialog();
      if (!dialog) {
        const launcher = await waitFor(findComposerLauncher, 25000);
        if (!launcher) throw new Error("ไม่พบปุ่มสร้างโพสต์ในกลุ่มนี้");
        launcher.click();
        dialog = await waitFor(getCreatePostDialog, 15000);
      }
      if (!dialog) throw new Error("เปิดหน้าต่างสร้างโพสต์ไม่สำเร็จ");

      const editor = await waitFor(findEditor, 12000);
      if (!editor) throw new Error("ไม่พบช่องเขียนข้อความในหน้าต่างสร้างโพสต์");

      setStatus("กำลังใส่ข้อความ…");
      const finalCaption = await replaceEditorText(editor, job.caption || "");
      await sleep(1200);

      const editorText = editor.innerText || editor.textContent || "";
      const expected = normalizeForCompare(finalCaption).slice(0, 15);
      const actual = normalizeForCompare(editorText);
      if (expected && !actual.includes(expected)) {
        throw new Error("Facebook ไม่รับข้อความอัตโนมัติ");
      }

      const expectedBreaks = (finalCaption.match(/\n/g) || []).length;
      const actualBreaks = (editorText.match(/\n/g) || []).length;
      if (expectedBreaks >= 2 && actualBreaks === 0) {
        throw new Error("Facebook ไม่รับการขึ้นบรรทัด กรุณาลองใหม่อีกครั้ง");
      }

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
        chrome.runtime.sendMessage({ type: "GROUPFLOW_FINISH_JOB", result: "posted", postUrl: location.href, notes: "โพสต์อัตโนมัติจาก GROUP FLOW Posting Agent V8" });
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
          chrome.runtime.sendMessage({ type: "GROUPFLOW_FINISH_JOB", result: "posted", postUrl: location.href, notes: "ผู้ใช้ตรวจสอบและกดโพสต์ผ่าน Posting Agent V8" });
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
