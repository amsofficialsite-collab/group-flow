chrome.storage.local.get("groupflow_active_job").then((data) => {
  const job = data.groupflow_active_job;
  if (job) document.getElementById("status").textContent = `งานปัจจุบัน: ${job.groupName || "Facebook Group"}\nโหมด: ${job.autoPost ? "โพสต์อัตโนมัติ" : "ตรวจสอบก่อน"}`;
});
document.getElementById("clear").onclick = async () => {
  await chrome.storage.local.remove("groupflow_active_job");
  document.getElementById("status").textContent = "ล้างงานค้างแล้ว";
};
