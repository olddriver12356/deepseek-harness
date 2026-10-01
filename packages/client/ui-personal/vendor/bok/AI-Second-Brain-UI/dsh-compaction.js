// DSH-owned understanding tidy-up. The owner approves every merged or translated claim before it is written.
"use strict";
window.addEventListener("DOMContentLoaded", () => {
  const labels = {
    zh: { open: "整理理解", title: "整理理解", intro: "模型会把相近的理解合并成一条原子理解，并把非中文理解改写为中文。原理解保留在历史中，可以撤销。", consent: "将向模型发送 {claims} 条理解。", private: "其中 {count} 条私密理解将发送给模型。", sensitive: "敏感理解不会发送。", start: "发送并生成建议", apply: "应用选中项", close: "关闭", working: "正在生成建议……", applying: "正在应用……", empty: "没有需要整理的理解。", merge: "合并 {count} 条", translate: "翻译为中文", applied: "已应用 {count} 项，备份 {backup}。", error: "整理失败：{message}", none: "当前没有可整理的理解。" },
    en: { open: "Tidy understanding", title: "Tidy understanding", intro: "The model merges similar understandings into one atomic understanding and rewrites non-Chinese ones in Chinese. Originals stay in history and can be restored.", consent: "{claims} understandings will be sent to the model.", private: "{count} of them are private and will be sent to the model.", sensitive: "Sensitive understandings are never sent.", start: "Send and propose", apply: "Apply selected", close: "Close", working: "Generating proposal…", applying: "Applying…", empty: "Nothing needs tidying.", merge: "Merge {count}", translate: "Translate to Chinese", applied: "Applied {count} items; backup {backup}.", error: "Tidy-up failed: {message}", none: "No understandings can be tidied now." },
  };
  const language = (document.documentElement.lang || "zh").startsWith("zh") ? "zh" : "en";
  const t = (key, values = {}) => labels[language][key].replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
  const toolbar = document.querySelector(".person-toolbar");
  if (!toolbar) return;
  const element = (tag, text = "", className = "") => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const entry = element("button", t("open"), "text-button");
  entry.type = "button";
  const dialog = element("dialog", "", "vault-profile-dialog compaction-dialog");
  dialog.setAttribute("aria-labelledby", "compactionTitle");
  const title = element("h2", t("title"));
  title.id = "compactionTitle";
  const intro = element("p", t("intro"));
  const status = element("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const list = element("ol", "", "compaction-list");
  const footer = element("footer");
  const start = element("button", t("start"));
  const apply = element("button", t("apply"));
  const close = element("button", t("close"));
  for (const button of [start, apply, close]) button.type = "button";
  footer.append(start, apply, close);
  dialog.append(title, intro, status, list, footer);
  document.body.append(dialog);
  toolbar.append(entry);
  let proposal;
  let busy = false;
  async function call(init) {
    const response = await fetch("/personal/api/compaction", init && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.message || value.error || String(response.status));
    return value;
  }
  async function run(work) {
    if (busy) return;
    busy = true;
    for (const button of [start, apply, close]) button.disabled = true;
    try { await work(); }
    catch (error) { status.textContent = t("error", { message: error.message }); }
    finally {
      busy = false;
      close.disabled = false;
      start.hidden = proposal !== undefined;
      start.disabled = false;
      apply.hidden = proposal === undefined || proposal.items.length === 0;
      apply.disabled = false;
    }
  }
  function render() {
    list.replaceChildren(...proposal.items.map((item, index) => {
      const row = element("li", "", "compaction-item");
      const label = element("label");
      const check = element("input");
      check.type = "checkbox";
      check.checked = true;
      check.dataset.index = String(index);
      const kind = element("strong", item.kind === "merge" ? t("merge", { count: item.originals.length }) : t("translate"));
      label.append(check, kind);
      const originals = element("ul", "", "compaction-originals");
      originals.append(...item.originals.map(original => element("li", original.statement)));
      row.append(label, originals, element("p", "→ " + item.statement, "compaction-result"));
      return row;
    }));
  }
  entry.onclick = () => {
    proposal = undefined;
    list.replaceChildren();
    dialog.showModal();
    void run(async () => {
      const summary = await call();
      if (summary.claims === 0) { status.textContent = t("none"); start.disabled = true; return; }
      status.textContent = [t("consent", summary), summary.private > 0 ? t("private", { count: summary.private }) : "", t("sensitive")].filter(Boolean).join(" ");
    });
  };
  start.onclick = () => void run(async () => {
    status.textContent = t("working");
    proposal = await call({ action: "propose" });
    status.textContent = proposal.items.length === 0 ? t("empty") : "";
    render();
  });
  apply.onclick = () => void run(async () => {
    const accepted = [...list.querySelectorAll("input:checked")].map(input => Number(input.dataset.index));
    status.textContent = t("applying");
    const result = await call({ action: "apply", id: proposal.id, accepted });
    if (result.error) throw new Error(result.error);
    status.textContent = t("applied", { count: result.applied.length, backup: result.backup_id || "-" });
    proposal = { ...proposal, items: [] };
    list.replaceChildren();
    if (typeof loadPersonDashboard === "function") await loadPersonDashboard();
  });
  close.onclick = () => dialog.close();
});
