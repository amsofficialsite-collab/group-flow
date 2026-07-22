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

    const marker = text.slice(0, Math.min(24, text.length)).trim();
    if (marker.length >= 8) {
      const secondStart = text.indexOf(marker, marker.length);
      if (secondStart > 0) {
        const first = text.slice(0, secondStart).trim();
        const second = text.slice(secondStart).trim();
        if (normalizeForCompare(first) === normalizeForCompare(second)) {
          return second;
        }
      }
    }

    const midpoint = Math.floor(text.length / 2);
    for (let offset = -120; offset <= 120; offset += 1) {
      const split = midpoint + offset;
      if (split <= 0 || split >= text.length) continue;
      const first = text.slice(0, split).trim();
      const second = text.slice(split).trim();
      if (first.length > 100 && normalizeForCompare(first) === normalizeForCompare(second)) {
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

  function replaceEditorText(editor, rawText) {
    const text = dedupeCaption(rawText);
    editor.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);

    document.execCommand("delete", false);
    const inserted = document.execCommand("insertText", false, text);

    if (!inserted) {
      throw new Error("Facebook ไม่รับคำสั่งใส่ข้อความอัตโนมัติ");
    }

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

  function findImageInput() {
    const inputs = [...document.querySelectorAll('input[type="file"]')].filter((el) => !el.disabled);
    return inputs.find((el) => {
      const accept = (el.accept || "").toLowerCase();
      return accept.includes("image") && el.multiple;
    }) || inputs.find((el) => (el.accept || "").toLowerCase().includes("image")) || null;
  }

  async function attachImages(imageUrls, setStatus) {
    if (!imageUrls.length) return;

    setStatus(`กำลังดาวน์โหลดรูป 0/${imageUrls.length}…`);
    const imageData = await requestImages(imageUrls);
    if (imageData.length !== imageUrls.length) throw new Error("ดาวน์โหลดรูปมาไม่ครบ");
    const files = imageData.map((item, index) => dataUrlToFile(item.dataUrl, item.type, index));

    const dialog = getCreatePostDialog();
    if (!dialog) throw new Error("ไม่พบหน้าต่างสร้างโพสต์");

    let input = findImageInput();
    if (!input) {
      const photoButton = [...dialog.querySelectorAll('[role="button"], button, div[tabindex="0"]')].filter(visible).find((el) => {
        const combined = `${textOf(el)} ${(el.getAttribute("aria-label") || "").toLowerCase()}`;
        return combined.includes("รูปภาพ/วิดีโอ") || combined.includes("รูปภาพ") || combined.includes("photo/video") || combined.includes("photo");
      });
      if (!photoButton) throw new Error("ไม่พบปุ่มรูปภาพ/วิดีโอ");
      photoButton.click();
      input = await waitFor(findImageInput, 10000);
    }

    if (!input) throw new Error("ไม่พบช่องอัปโหลดรูปของ Facebook");

    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    Object.defineProperty(input, "files", { value: transfer.files, configurable: true });
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

    setStatus(`กำลังอัปโหลดรูป ${files.length} รูป…`);
    await sleep(Math.max(7000, files.length * 3000));
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
      <div style="font-weight:700;font-size:17px">GROUP FLOW Posting Agent V4</div>
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
      const finalCaption = replaceEditorText(editor, job.caption || "");
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
        chrome.runtime.sendMessage({ type: "GROUPFLOW_FINISH_JOB", result: "posted", postUrl: location.href, notes: "โพสต์อัตโนมัติจาก GROUP FLOW Posting Agent V4" });
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
          chrome.runtime.sendMessage({ type: "GROUPFLOW_FINISH_JOB", result: "posted", postUrl: location.href, notes: "ผู้ใช้ตรวจสอบและกดโพสต์ผ่าน Posting Agent V4" });
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
