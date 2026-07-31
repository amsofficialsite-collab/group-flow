importScripts("config.js");

console.log("===== GROUP FLOW V11 BACKGROUND LOADED =====");

const JOB_KEY = "groupflow_active_job";
const SCHEDULER_ALARM_NAME = "GROUPFLOW_SCHEDULER";
const API_BASE_URL = String(self.GROUPFLOW_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
const AGENT_SECRET = String(self.GROUPFLOW_CONFIG?.AGENT_SECRET || "");

function assertConfig() {
  if (!API_BASE_URL || API_BASE_URL.includes("YOUR-PROJECT")) {
    throw new Error("ยังไม่ได้ตั้งค่า API_BASE_URL ใน config.js");
  }
  if (!AGENT_SECRET || AGENT_SECRET.includes("CHANGE-THIS")) {
    throw new Error("ยังไม่ได้ตั้งค่า AGENT_SECRET ใน config.js");
  }
}

async function apiFetch(path, options = {}) {
  assertConfig();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-groupflow-agent-secret": AGENT_SECRET,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text || `HTTP ${response.status}` };
  }

  if (!response.ok) {
    throw new Error(body?.error || `API ล้มเหลว (${response.status})`);
  }
  return body;
}

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

async function startJob(job, sourceTabId = null) {
  const current = await chrome.storage.local.get(JOB_KEY);
  if (current[JOB_KEY]) {
    console.log("[GROUP FLOW] มีงานกำลังทำอยู่ จึงยังไม่เริ่มงานใหม่");
    return { ok: false, busy: true };
  }

  const storedJob = {
    ...job,
    createdAt: Date.now(),
    sourceTabId,
  };

  await chrome.storage.local.set({ [JOB_KEY]: storedJob });

  try {
    const tab = await chrome.tabs.create({ url: job.groupUrl, active: true });
    await chrome.storage.local.set({
      [JOB_KEY]: { ...storedJob, facebookTabId: tab.id },
    });
    console.log("[GROUP FLOW] เปิด Facebook สำหรับคิว", job.queueId);
    return { ok: true };
  } catch (error) {
    await chrome.storage.local.remove(JOB_KEY);
    throw error;
  }
}

async function finishRemoteJob(job, message) {
  if (!job?.queueId) return;

  await apiFetch("/api/posting/finish", {
    method: "POST",
    body: JSON.stringify({
      queueId: job.queueId,
      result: message.result,
      postUrl: message.postUrl || null,
      notes: message.notes || "บันทึกจาก Chrome Posting Agent V11",
    }),
  });
}

async function runScheduler() {
  console.log("[GROUP FLOW] Scheduler ตรวจสอบคิว:", new Date().toLocaleString("th-TH"));

  const current = await chrome.storage.local.get(JOB_KEY);
  if (current[JOB_KEY]) {
    console.log("[GROUP FLOW] ข้ามรอบนี้ เพราะมี Active Job อยู่");
    return;
  }

  const response = await apiFetch("/api/posting/next-job", { method: "POST" });
  if (!response?.job) {
    console.log("[GROUP FLOW] ยังไม่มีคิวที่ถึงเวลา");
    return;
  }

  console.log("[GROUP FLOW] พบคิวที่ถึงเวลา", response.job.queueId);
  await startJob(response.job, null);
}

async function ensureSchedulerAlarm() {
  const existingAlarm = await chrome.alarms.get(SCHEDULER_ALARM_NAME);
  if (!existingAlarm) {
    await chrome.alarms.create(SCHEDULER_ALARM_NAME, {
      delayInMinutes: 0.1,
      periodInMinutes: 1,
    });
    console.log("[GROUP FLOW] สร้าง Scheduler สำเร็จ");
  } else {
    console.log("[GROUP FLOW] Scheduler ทำงานอยู่แล้ว");
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureSchedulerAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureSchedulerAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SCHEDULER_ALARM_NAME) return;
  void runScheduler().catch((error) => {
    console.error("[GROUP FLOW] Scheduler Error:", error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GROUPFLOW_START_POST") {
    startJob(message.job, sender.tab?.id || null)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GROUPFLOW_GET_JOB") {
    chrome.storage.local.get(JOB_KEY)
      .then((data) => sendResponse({ ok: true, job: data[JOB_KEY] || null }));
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
        notes: message.notes || "บันทึกจาก Chrome Posting Agent V11",
      };

      try {
        await finishRemoteJob(job, message);

        if (job?.sourceTabId) {
          try {
            await chrome.tabs.sendMessage(job.sourceTabId, {
              type: "GROUPFLOW_POST_RESULT",
              result,
            });
            await chrome.tabs.update(job.sourceTabId, { active: true });
          } catch (_) {}
        }

        await chrome.storage.local.remove(JOB_KEY);
        sendResponse({ ok: true });
      } catch (error) {
        console.error("[GROUP FLOW] บันทึกผลไม่สำเร็จ:", error);
        sendResponse({ ok: false, error: error.message });
      }
    });
    return true;
  }
});

void ensureSchedulerAlarm();
