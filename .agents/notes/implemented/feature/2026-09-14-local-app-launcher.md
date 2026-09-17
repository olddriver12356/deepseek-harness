# Agent Note: Registered local web applications

Status: implemented

English | [中文](2026-09-14-local-app-launcher.zh.md)

## Problem

Opening local web tools requires finding each repository and running its package script manually.

## Decision

The Apps page registers explicitly selected project directories, reads package scripts without editing dependencies, and persists registrations in the `local-apps` settings namespace. The existing subprocess service owns application processes. Only managed applications can be stopped. External applications require explicit confirmation. URLs are restricted to loopback HTTP(S), logs are bounded, and automatic port strategies probe available ports before launching.

The page uses the approved torn-paper background, warm `#EDE9DF` card faces, repeating three-color backplates, outlined controls, and a 14px text minimum. Apps precedes News; navigation always places News last.

The native page reproduces the approved mockup's split print-offset title, stamped collection labels, counted filters, layered SVG initials, status dots, and irregular outlined actions. Filters preserve each record's color assignment, and the running filter includes externally confirmed applications. Container queries adapt the grid when the Files sidebar reduces available width. The optional Cyberdeck scanline overlay and button clipping are suppressed only while this page is visible so they do not distort the approved artwork.

## Alternatives considered

**Automatic directory discovery** was rejected because registration should remain explicit and avoid exposing unrelated projects. **Editing dependencies** was rejected because this feature launches existing scripts rather than maintaining project installations. **A separate process manager** was rejected in favor of the existing managed subprocess service.

## Consequences

Projects must already have their dependencies installed. Their selected script must support the configured port strategy. Registry removal preserves project files. Launch-time port collisions retry twice when the child reports an address-in-use error. Reverting the feature commit removes the page and service while preserving stored registration data.

## Testing

Focused tests cover manifest validation, registry persistence, registration UI, occupied-port selection, duplicate starts, process ownership, and News ordering. The clean master-based build is blocked by the pre-existing host Knowledge source without its package manifest or TypeScript project. Dependency audit reports 38 findings across existing dependency chains. These failures are not repaired as part of the Apps feature.
