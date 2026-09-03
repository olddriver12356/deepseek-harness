# @deepseek-ai/dsh-client-ui-shell

English | [中文](README.zh.md)

Shell plugin: four-track AppFrame (`app.rail` | sidebar | center | details, with drag handles and a concession chain) plus the `ctx.layout` panel-geometry service and `ctx.appPanels` active-panel service; it registers into the runtime-owned `root` slot and declares `app.rail`, `sidebar`, `conversation`, `details`, and `shell.overlay`. The root-scoped `app.rail` renders in a fixed 72px leftmost track with an empty owner share, so app navigation remains present while the independent sidebar collapses to its 56px compact controls. The sidebar resize boundary is an invisible hit strip, while the details boundary retains its floating pill; only details shrinks during concession and then auto-closes to zero width. The package also seats the theme presenter: it consumes resolved `ctx.theme` snapshots and projects them onto the document (`html { color-scheme }` for native UA chrome, `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens as inline variables on body, and one owned `<meta name="theme-color">` whose content follows the computed body background). Measuring after palette and token application keeps the rendered background as the single color authority; disposing the presenter removes its metadata node with its other global writes.

Every `shell.overlay` occupant is seated in the center and details area to the right of the fixed AppRail. Knowledge uses this slot as an independently mounted panel, so changing `ctx.appPanels` changes visibility without moving or covering the navigation rail.

AppFrame always mounts the app rail, conversation, and details columns; a connected Session renders through `SessionProvider`. The transient layout store starts the sidebar at its default width and details closed, and it never reads or writes `localStorage`. `ctx.appPanels` starts on `agent`, accepts `agent`, `knowledge`, `experts`, `styles`, `monitor`, or `news`, and exposes `getSnapshot` and `subscribe` for React `useSyncExternalStore`; selecting the active value again does not notify subscribers. It owns visibility only, so selection does not elect slot occupants or unmount panel state. Hero and other unselected states also derive a zero rendered details width without changing that stored preference. AppFrame retains the last non-blank Session id across those states: the first Session remains closed, an explicit details action opens the contract default width, returning to the same Session restores its unchanged width, and selecting a different Session closes details before paint. The app rail, conversation, and details owner shares are empty, while the sidebar owner share contains only `collapsed` and `width`; registrants obtain business data from standard hooks and actions from their own inject faces.

The `/client` exports are the plugin body (`apply`/`inject`), `LayoutController`, `ILayout`, `AppPanelsController`, `IAppPanels`, `PanelId`, and the four owner-share interfaces. AppFrame, the panel store, and the concession solver remain package-internal.

## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Shell viewing state is transient** — reload restores `ctx.appPanels` to `agent`, the sidebar default, and details closed; switching between distinct Session ids also closes details and forgets its dragged width, while unselected surfaces render details at zero width without modifying geometry.
- **Concession-chain auto-close derives a zero width without touching the preferred width** — the panel restores itself when the window widens; consumers must not read the stored details width as the rendered truth.
- **No scroll anchoring during squeeze reflow** — layout changes may move the reader's viewport.
