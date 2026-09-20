# Agent Note: 从消费方上下文注册独立 RPC

Status: implemented

[English](2026-09-18-dedicated-rpc-consumer-context.md) | 中文

## Problem

独立 RPC 注册在调用插件的 Context 中使用 `owner.webServer`。只注入 `connection` 的插件无法访问这个未声明的服务，即使同级 Web 服务已经运行。订阅插件的注册因此报出 `cannot get property "webServer" without inject`；随后 POST 请求落入静态页面兜底处理并返回 405。在根上下文提供服务的测试替身掩盖了这个依赖错误。

## Decision

`HostConnectionService.register` 通过 `owner.get('webServer')` 查找可用的 Web 服务，并继续由调用方的 effect 管理路由注册。消费方只需注入 `connection`。缺少 Web 传输时，注册前会明确报错。现有浏览器认证与 Host/Origin 检查仍在分发前执行。

## Alternatives considered

**给订阅插件增加 `webServer` 注入。** 这会让消费方依赖 connection 服务的实现细节，其他消费方仍会遇到同样的错误。

**引入传输注册表或延迟挂载路由。** 出问题的部署已经有运行中的 Web 服务。本次修复不需要新增注册表或改变注册时机。

## Consequences

独立 RPC 消费方可以从普通插件上下文工作，其路由会在消费方销毁时移除。独立通道仍要求注册时已有可用 Web 服务；本次修改没有为其增加与传输载体无关的实现。回归检查使用同级服务提供方，替代根上下文提供的服务，执行通过认证的请求并检查路由撤销。现有请求信任测试继续覆盖认证行为。
