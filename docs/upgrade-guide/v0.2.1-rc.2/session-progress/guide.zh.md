---
kind: upgrade-guide
description: "使用长期进度或受保护 Goal 续行的 Session，需要能识别其必需记录的读取方。"
---

# 安全打开包含长期进度的 Session

[English](guide.md) | 中文

## 变更

Session 可以包含必需的 `progress/change` 记录及已记录的 `long-term-progress` 提醒消息。Goal 续行消息指定 `goal-round` 准入策略。无法识别新增必需事件的旧读取方会拒绝打开 Session，而不是静默丢弃里程碑权限或将其当作损坏数据处理。没有这些记录的已有 Session 保持原有含义；本次新增不改变检出代码的写入格式版本。

Session 具有非空里程碑清单后，普通 Goal 创建或编辑不能选择无关工作。执行必须绑定到明确放行的当前里程碑内一组连续且未完成的检查点。批准、放行与验收分别独立，重新打开或 fork 不会激活执行。Goal 服务的自定义消费方必须处理范围操作被拒绝的情况，不能绕过检查。

## 迁移

1. 同步升级所有打开含进度 Session 的 Host 或 SDK runtime。保留一份未经修改的 Session 备份；不要删除 `progress/change` 记录或将其标为 ignorable 来让旧读取方接受。
2. 自定义组合在现有 Goal 服务与驱动旁挂载 `@deepseek-ai/dsh-long-term-progress`。base profile 已包含它；这不代表运行中的部署获得自动重启授权。
3. 通过 `/long-goal status` 检查恢复的清单。明确开始已批准的里程碑，或核实预期范围后恢复已绑定的执行 Goal。fork 的已有清单关联必须重新确认后才能启用写回。
4. 确认能够查看精简进度、保存草稿不会启动轮次，并且里程碑边界会停止并等待人工验收。包的[契约](../../../../packages/goal/long-term-progress/README.md)记录命令语法、工具、限制与文件系统冲突处理。
