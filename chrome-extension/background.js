const JOB_KEY = "groupflow_active_job";

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
