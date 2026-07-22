(() => {
  const FLAG = "data-groupflow-extension";
  document.documentElement.setAttribute(FLAG, "connected");

  window.addEventListener("groupflow:start-post", (event) => {
    const job = event.detail;
    if (!job?.queueId || !job?.groupUrl) return;
    chrome.runtime.sendMessage({ type: "GROUPFLOW_START_POST", job }, (response) => {
      if (chrome.runtime.lastError) {
        window.alert("ยังไม่พบ GROUP FLOW Posting Agent กรุณาติดตั้ง Extension และเปิดใช้งานก่อนค่ะ");
        return;
      }
      if (!response?.ok) window.alert(response?.error || "ส่งงานไป Posting Agent ไม่สำเร็จค่ะ");
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "GROUPFLOW_POST_RESULT") return;
    window.dispatchEvent(new CustomEvent("groupflow:post-result", { detail: message.result }));
  });
})();
