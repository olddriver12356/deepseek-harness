# Agent Note: Read-only agent tool catalog in Tools

Status: implemented

English | [中文](2026-10-02-agent-tool-catalog.zh.md)

## Problem

The Skills panel exposed skill files but gave no single place to inspect the other agent tools already available through the client. Users had to look elsewhere to find session commands and configured integrations.

## Decision

The existing Skills panel keeps its visual design and skill editor. Tabs add read-only directories for Commands, MCP, Hooks, and Plugins. Each tab has a name and description creation form that hands a tailored prompt to a fresh Session; the agent asks for missing details and creates the tool in chat. A failed handoff retries the same Session and request. The selected session supplies command rows through `remote.commands.list`; `remote.pluginInventory.list` supplies host and agent preset plugin rows. MCP and Hooks are filtered views of that plugin inventory. Their statuses describe plugin configuration and phase, not a verified MCP connection or hook execution.

The directories show names, descriptions, source, and status. Known Session slash commands also show input syntax, specific use cases, and examples. Agent Teams plugin rows explain their opt-in model-tool workflow and distinguish it from native slash commands; unknown commands keep an explicit summary-only notice. The directories do not expose configuration values or offer edit, enable, or disable actions. The skill editor's existing unsaved-change navigation guard applies when switching tabs.

## Alternatives considered

A new agent-tools page would duplicate the existing Skills navigation and workbench styling. Separate MCP and hook runtime inventories would require new data contracts before there is a need to manage or diagnose individual connections and executions.

## Consequences

Commands reflect the selected session, while plugin rows reflect the host and selected agent preset. A missing session leaves the Commands directory empty. The directory does not prove MCP connectivity or that a hook has run; those require dedicated runtime data if later requested.
