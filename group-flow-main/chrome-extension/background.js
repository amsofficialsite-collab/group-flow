importScripts("config.js");

console.log("===== GROUP FLOW V12 BACKGROUND LOADED =====");

const JOB_KEY = "groupflow_active_job";
const SCHEDULER_ALARM_NAME = "GROUPFLOW_SCHEDULER";
const JOB_TIMEOUT_MS = 5 * 60 * 1000;
const API_BASE_URL = String(self.GROUPFLOW_CONFIG?.API_BASE_URL || "").trim().replace(/\/$/, "");
const AGENT_SECRET = String(self.GROUPFLOW_CONFIG?.AGENT_SECRET || "").trim();

let schedulerRunning = false;

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
  let body;
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

async function tabStillExists(tabId) {
  if (!tabId) return false;
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch {
    return false;
  }
}

async function recoverStaleJob() {
  const data = await chrome.storage.local.get(JOB_KEY);
  const job = data[JOB_KEY];
  if (!job) return null;

  const age = Date.now() - Number(job.createdAt || 0);
  const tabExists = await tabStillExists(job.facebookTabId);

  if (age > JOB_TIMEOUT_MS || !tabExists) {
    console.warn(
      `[GROUP FLOW] ล้างงานค้างอัตโนมัติ queue=${job.queueId || "-"} age=${Math.round(age / 1000)}s tab=${tabExists}`,
    );
    await chrome.storage.local.remove(JOB_KEY);
    return null;
  }

  return job;
}

async function startJob(job, sourceTabId = null) {
  const activeJob = await recoverStaleJob();
  if (activeJob) {
    console.log("[GROUP FLOW] มีงานกำลังทำอยู่ จึงยังไม่เริ่มงานใหม่", activeJob.queueId);
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
  if (!job?.queueId) throw new Error("ไม่พบ queueId ของงานปัจจุบัน");

  return apiFetch("/api/posting/finish", {
    method: "POST",
    body: JSON.stringify({
      queueId: job.queueId,
      result: message.result,
      postUrl: message.postUrl || null,
      notes: message.notes || "บันทึกจาก Chrome Posting Agent V12",
    }),
  });
}

async function runScheduler() {
  if (schedulerRunning) {
    console.log("[GROUP FLOW] ข้ามรอบซ้อน เพราะ Scheduler กำลังทำงาน");
    return;
  }

  schedulerRunning = true;
  try {
    console.log("[GROUP FLOW] Scheduler ตรวจสอบคิว:", new Date().toLocaleString("th-TH"));

    const activeJob = await recoverStaleJob();
    if (activeJob) {
      console.log("[GROUP FLOW] ข้ามรอบนี้ เพราะมี Active Job อยู่", activeJob.queueId);
      return;
    }

    const response = await apiFetch("/api/posting/next-job", { method: "POST" });
    if (!response?.job) {
      console.log("[GROUP FLOW] ยังไม่มีคิวที่ถึงเวลา");
      return;
    }

    console.log("[GROUP FLOW] พบคิวที่ถึงเวลา", response.job.queueId);
    await startJob(response.job, null);
  } finally {
    schedulerRunning = false;
  }
}

async function ensureSchedulerAlarm() {
  const existingAlarm = await chrome.alarms.get(SCHEDULER_ALARM_NAME);
  if (!existingAlarm) {
    chrome.alarms.create(SCHEDULER_ALARM_NAME, {
      delayInMinutes: 0.1,
      periodInMinutes: 1,
    });
    console.log("[GROUP FLOW] สร้าง Scheduler สำเร็จ");
  } else {
    console.log("[GROUP FLOW] Scheduler ทำงานอยู่แล้ว");
  }
}

async function boot() {
  try {
    console.log("[GROUP FLOW] API:", API_BASE_URL);
    await ensureSchedulerAlarm();
    await recoverStaleJob();
    await runScheduler();
  } catch (error) {
    console.error("[GROUP FLOW] เริ่มระบบไม่สำเร็จ:", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void boot();
});

chrome.runtime.onStartup.addListener(() => {
  void boot();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SCHEDULER_ALARM_NAME) return;
  void runScheduler().catch((error) => {
    console.error("[GROUP FLOW] Scheduler Error:", error);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.local.get(JOB_KEY).then(async (data) => {
    const job = data[JOB_KEY];
    if (job?.facebookTabId === tabId) {
      console.warn("[GROUP FLOW] Facebook tab ถูกปิด จึงล้าง Active Job");
      await chrome.storage.local.remove(JOB_KEY);
    }
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
      .then((data) => sendResponse({ ok: true, job: data[JOB_KEY] || null }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GROUPFLOW_FETCH_IMAGES") {
    const urls = Array.isArray(message.urls) ? message.urls.filter(Boolean) : [];
    Promise.all(urls.map(fetchImageAsDataUrl))
      .then((images) => sendResponse({ ok: true, images }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GROUPFLOW_RUN_NOW") {
    runScheduler()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GROUPFLOW_FINISH_JOB") {
    void chrome.storage.local.get(JOB_KEY).then(async (data) => {
      const job = data[JOB_KEY];
      const result = {
        queueId: job?.queueId,
        result: message.result,
        postUrl: message.postUrl || null,
        notes: message.notes || "บันทึกจาก Chrome Posting Agent V12",
      };

      let finishError = null;
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
      } catch (error) {
        finishError = error;
        console.error("[GROUP FLOW] บันทึกผลไม่สำเร็จ:", error);
      } finally {
        // ปลดล็อกเสมอ เพื่อไม่ให้งานหนึ่งบล็อกทุกกลุ่มถัดไป
        await chrome.storage.local.remove(JOB_KEY);

        // ปิดแท็บงานเดิม เพื่อให้เห็นชัดว่าระบบย้ายไปยังกลุ่มถัดไป
        if (job?.facebookTabId) {
          try {
            await chrome.tabs.remove(job.facebookTabId);
          } catch (_) {}
        }

        console.log("[GROUP FLOW] ปลด Active Job แล้ว", job?.queueId);
        sendResponse(
          finishError
            ? { ok: false, error: finishError.message }
            : { ok: true },
        );

        // ตรวจคิวถัดไปไม่ว่าการบันทึก posting_logs จะสำเร็จหรือไม่
        setTimeout(() => {
          void runScheduler().catch((error) =>
            console.error("[GROUP FLOW] ตรวจคิวถัดไปไม่สำเร็จ:", error),
          );
        }, 2500);
      }
    });
    return true;
  }
});

void boot();
