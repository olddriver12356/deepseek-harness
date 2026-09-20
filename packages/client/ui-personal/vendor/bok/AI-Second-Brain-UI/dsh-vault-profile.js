// DSH-owned adapter UI. Original Bok pages and claim operations remain unchanged.
"use strict";
window.addEventListener("DOMContentLoaded", () => {
  const toolbar = document.querySelector(".person-toolbar");
  if (!toolbar) return;
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const entry = element("button", "Vault 连接", "text-button");
  entry.type = "button";
  toolbar.append(entry);
  const warning = element("p", "", "vault-profile-warning");
  warning.hidden = true;
  warning.setAttribute("role", "status");
  toolbar.after(warning);
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.headers.get("X-Vault-Profile-Warning")) {
      warning.textContent = "Personal Core 操作已完成，但 Vault 导出撤回尚未完成。请打开 Vault 连接重试清理。";
      warning.hidden = false;
    }
    return response;
  };
  const dialog = element("dialog", "", "vault-profile-dialog");
  dialog.setAttribute("aria-labelledby", "vaultProfileTitle");
  const title = element("h2", "Vault 个人画像连接");
  title.id = "vaultProfileTitle";
  const intro = element("p", "连接 Memory/Semantic/profile/。仅列出已生效、全局且明确授权所有 Agent 的记录；敏感级别不导出，私人级别仍需逐条确认共享。现有 Profile.md 不会被修改。导出文件可被 Vault 中的其他 Agent 读取。");
  const status = element("p");
  status.setAttribute("role", "status");
  const list = element("div");
  const footer = element("footer");
  const refresh = element("button", "刷新预览");
  const close = element("button", "关闭");
  refresh.type = close.type = "button";
  footer.append(refresh, close);
  dialog.append(title, intro, status, list, footer);
  document.body.append(dialog);
  let busy = false;
  const labels = { not_exported: "未导出", synced: "已同步", vault_changed: "Vault 有修改", core_changed: "Core 有更新", conflict: "两边冲突或文件格式改变", withdrawn: "已撤回" };
  async function run(payload = { action: "status" }) {
    if (busy) return;
    busy = true;
    dialog.querySelectorAll("button").forEach(button => { button.disabled = true; });
    status.textContent = "正在检查…";
    try {
      const response = await originalFetch("/personal/api/vault-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "同步失败");
      list.replaceChildren();
      status.textContent = `${result.items.length} 条可共享画像 · ${result.withdrawn} 条已撤回。`;
      warning.hidden = true;
      if (!result.items.length) list.append(element("p", "目前没有可导出的记录。在原版界面确认画像并明确授权所有 Agent 使用后，才会出现在这里；连接目录不会自动导入旧 Profile 或日志。"));
      for (const item of result.items) {
        const card = element("section", "", "vault-profile-row");
        card.append(element("strong", labels[item.status]), element("p", item.statement), element("small", item.id + (item.sensitivity === "private" ? " · 私人记录，导出后进入共享 Vault" : "")));
        if (item.vaultStatement !== undefined) card.append(element("p", "Vault 修改预览："), element("pre", item.vaultStatement));
        if (item.error) card.append(element("p", item.error));
        const action = (label, command, confirmText) => {
          const button = element("button", label);
          button.type = "button";
          button.onclick = () => {
            if (confirmText && !window.confirm(confirmText)) return;
            void run({ action: command, id: item.id, version: item.version, preview: item.preview, confirm: !!confirmText });
          };
          card.append(button);
        };
        if (["not_exported", "core_changed"].includes(item.status)) action("导出到 Vault", "export", "将这条画像写入共享 Vault？Vault 的历史和备份可能保留它。此操作不修改现有 Profile.md。");
        if (item.status === "withdrawn") action("重新确认共享", "export", "这条导出曾被撤回。确认重新把当前 Core 记录共享到 Vault？");
        if (item.status === "vault_changed") action("确认纠正到 Core", "apply", "确认采用预览中的 Vault 文本纠正 Personal Core？此操作沿用原版纠正流程并保留当前访问授权。");
        if (["vault_changed", "conflict"].includes(item.status) && item.preview) action("保留 Core 版本", "export", "用当前 Core 文本替换此 Vault 导出？现有文件会先保存到本机私有恢复目录。");
        list.append(card);
      }
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; dialog.querySelectorAll("button").forEach(button => { button.disabled = false; }); }
  }
  entry.onclick = () => { dialog.showModal(); void run(); };
  refresh.onclick = () => { void run(); };
  close.onclick = () => dialog.close();
});
