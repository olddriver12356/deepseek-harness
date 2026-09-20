// DSH-owned observer controls; Bok's claim review and authorization remain separate.
"use strict";
window.addEventListener("DOMContentLoaded", () => {
  const labels = {
    zh: { pause: "暂停对话观察", resume: "开启对话观察", refresh: "检查观察状态", error: "观察状态读取或更新失败", disabled: "对话观察已暂停", not_configured: "对话观察未配置", idle: "对话观察已开启，等待新的完整对话轮次", observing: "正在后台观察", observed: "本轮观察已提交", no_signal: "本轮没有值得长期记忆的信号", failed: "最近一次观察失败，后续对话仍会继续观察", cancelled: "观察已取消", excluded_sensitive: "已跳过敏感内容", excluded_private: "已尊重本轮不记忆要求", access_revoked: "Personal Core 访问已撤销", queue_full: "观察队列已满，已跳过一轮", input_too_large: "本轮内容超出观察上限，已跳过" },
    en: { pause: "Pause conversation observation", resume: "Enable conversation observation", refresh: "Check observation status", error: "Could not read or update observation status", disabled: "Conversation observation is paused", not_configured: "Conversation observation is not configured", idle: "Observation enabled; waiting for a new complete turn", observing: "Observing in the background", observed: "Turn observations submitted", no_signal: "No durable personal signal in this turn", failed: "The last observation failed; later turns will still be observed", cancelled: "Observation cancelled", excluded_sensitive: "Sensitive content skipped", excluded_private: "This turn's memory exclusion was respected", access_revoked: "Personal Core access revoked", queue_full: "Observation queue full; one turn skipped", input_too_large: "Turn exceeds observation input limit; skipped" },
  };
  const language = (document.documentElement.lang || "zh").startsWith("zh") ? "zh" : "en";
  const t = labels[language];
  const toolbar = document.querySelector(".person-toolbar");
  if (!toolbar) return;
  const toggle = document.createElement("button");
  const refresh = document.createElement("button");
  const status = document.createElement("p");
  toggle.type = refresh.type = "button";
  toggle.className = refresh.className = "text-button";
  refresh.textContent = t.refresh;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  toolbar.append(toggle, refresh);
  toolbar.after(status);
  let current;
  let busy = false;
  async function update(change) {
    if (busy) return;
    busy = true;
    toggle.disabled = refresh.disabled = true;
    try {
      const response = await fetch("/personal/api/observer", change === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: change }) });
      if (!response.ok) throw new Error(t.error);
      current = await response.json();
      toggle.textContent = current.enabled ? t.pause : t.resume;
      toggle.setAttribute("aria-pressed", String(current.enabled));
      status.textContent = t[current.status] || t.error;
    } catch { status.textContent = t.error; }
    finally { busy = false; refresh.disabled = false; toggle.disabled = !current || current.status === "not_configured"; }
  }
  toggle.onclick = () => void update(!current.enabled);
  refresh.onclick = () => void update();
  void update();
  const timer = setInterval(() => { if (!document.hidden) void update(); }, 10000);
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
});
