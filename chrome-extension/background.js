const JOB_KEY = "groupflow_active_job";

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fetchImageAsDataUrl(url) {
  const response = await fetch(url, { credentials: "omit", cache: "no-store" });
  if (!response.ok) throw new Error(`ดาวน์โหลดรูปไม่สำเร็จ (${response.status})`);
  const blob = await response.blob();
  const type = blob.type || "image/jpeg";
  const buffer = await blob.arrayBuffer();
  return { dataUrl: `data:${type};base64,${arrayBufferToBase64(buffer)}`, type };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GROUPFLOW_START_POST") {
    const job = { ...message.job, createdAt: Date.now(), sourceTabId: sender.tab?.id || null };
    chrome.storage.local.set({ [JOB_KEY]: job }).then(async () => {
      const tab = await chrome.tabs.create({ url: job.groupUrl, active: true });
      await chrome.storage.local.set({ [JOB_KEY]: { ...job, facebookTabId: tab.id } });
      sendResponse({ ok: true });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GROUPFLOW_GET_JOB") {
    chrome.storage.local.get(JOB_KEY).then((data) => sendResponse({ ok: true, job: data[JOB_KEY] || null }));
    return true;
  }

  if (message?.type === "GROUPFLOW_FETCH_IMAGES") {
    const urls = Array.isArray(message.urls) ? message.urls.filter(Boolean) : [];
    Promise.all(urls.map(fetchImageAsDataUrl))
      .then((images) => sendResponse({ ok: true, images }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GROUPFLOW_FINISH_JOB") {
    chrome.storage.local.get(JOB_KEY).then(async (data) => {
      const job = data[JOB_KEY];
      const result = {
        queueId: job?.queueId,
        result: message.result,
        postUrl: message.postUrl || null,
        notes: message.notes || "บันทึกจาก Chrome Posting Agent"
      };
      if (job?.sourceTabId) {
        try {
          await chrome.tabs.sendMessage(job.sourceTabId, { type: "GROUPFLOW_POST_RESULT", result });
          await chrome.tabs.update(job.sourceTabId, { active: true });
        } catch (_) {}
      }
      await chrome.storage.local.remove(JOB_KEY);
      sendResponse({ ok: true });
    });
    return true;
  }
});
