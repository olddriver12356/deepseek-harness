# @deepseek-ai/dsh-client-ui-monitor

Monitor application panel for the web surface. It registers a persistent session-aware `shell.overlay` occupant, follows `ctx.appPanels`, and presents token usage, context occupancy, reasoning effort, and trajectory data in the approved Boujoy visual language. Token and context values come from native projections; effort reads the latest native request config, and trajectory reads the native `conversation.view` snapshot.

The panel is read-only in this phase: controls are present for layout validation but disabled, and no Vault or host mutation path is introduced. The `/client` export provides the plugin body (`apply`/`inject`) and `MonitorPanel`.

## Model Experience

None, as the panel currently renders UI placeholders and does not assemble or send model requests.

#### KV Cache effect

None; native cache projections are not wired yet.

## Known Limitations and Deferred Work

- **Missing capability**: absent native projection/view values remain explicit placeholders.
- **Disabled controls**: refresh, effort selection, trajectory filters, and search are visual affordances only; effort write-back has no host command contract yet.
