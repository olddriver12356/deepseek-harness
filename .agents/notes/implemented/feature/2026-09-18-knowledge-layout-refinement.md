# Agent Note: Knowledge layout refinement

Status: implemented

English | [中文](2026-09-18-knowledge-layout-refinement.zh.md)

## Problem

Knowledge's separated filter rows and generous spacing delayed useful content. The owner also selected Bok's compact paper cards for the artifact library while retaining the rest of the page's styling.

## Decision

Keep the original background, title and layer summaries. The selected-artifact focus area and full reader share the library paper palette; reader actions and approval behavior are preserved. Library cards use warm paper, CSS-only torn edges and texture, subtle alternating tilt and a 140ms hover lift, inspired by [Bok](https://github.com/asen-goat-mine/bok). Titles take priority over body previews; summaries remain searchable and visible in the focus area. Refresh and feedback sit in the header, filters share a control area, and the focus card sits alongside summaries ordered by the existing three-stage flow. Search, selection, full timestamps, reader actions and approval behavior are preserved.

## Alternatives considered

**Replace the background or introduce a new theme.** Neither is needed to improve the hierarchy, and replacing the background conflicts with the request.

**Introduce a shared collection-page framework.** This change belongs to one existing package; CSS Modules and the existing components cover the required layout.

## Consequences

Container queries adapt to the actual panel width, including a narrow pane beside Files. Paper decoration belongs to a pseudo-element so it cannot clip the native button's keyboard focus outline. Reduced-motion preferences disable tilt and lift. Layer summaries retain their original 680ms hover sequence. Component tests cover selection, filtering and reader behavior; the built page is checked for responsive layout and keyboard access. No Bok storage, runtime or assets are imported, and the reader behavior and approval workflow are unchanged.
