# Agent Note: Vault Memory inside About Me

Status: implemented

English | [中文](2026-09-20-vault-memory-view.zh.md)

## Decision

The owner requested a Memory view inside About Me using a supplied background, without another application entry. The existing `ui-personal` plugin owns the nested view and authenticated read API. The original iframe stays mounted when Memory is open, preserving unsaved Personal Core state. Pinned Bok code and shared runtime services are unchanged.

The view reads the configured owner's Vault through `ideasVaultRoot`, not Bok's private runtime Vault. Working, Episodic, Semantic and Handoff retain the source directory structure; Flags is an auxiliary entry. Titles and paths are searchable, selection reads Markdown on demand, and the reader supports rendered and raw source. Requests cannot select arbitrary Vault files or traverse linked directories. Reads are bounded to one MiB per document and the catalog to 5,000 entries. No memory database, model call, import or write route is added.

## Alternatives

The approved combined visual uses numbered film cards beside a warm paper reader. Tier controls stay above the workspace; episode files group by filename month, undated indexes have their own group, semantic files group by their source folder, and handoffs sort by modification time. Counts mean files, including indexes. The existing API supplies all metadata, so the design adds no thumbnail generation, eager document reads or database. The heading is Memory fragments while the nested navigation remains Memory. Narrow screens stack the bounded directory above the reader. Local token overrides keep Markdown readable on the light paper without changing the global theme.

A separate top-level plugin page would contradict the requested navigation. A second index database would duplicate the Vault and require synchronization. Editing Bok's application router would increase vendor integration work. The existing owning plugin and shared Markdown primitive cover the requirement with one file-reading module and one nested view.

## Verification and limits

The owner subsequently clarified that the film cards must retain photographic artwork rather than large number tiles. The plugin now packages three decorative monochrome scenes, assigns them consistently by source path and overlays a small corner number. The authenticated image route allows only the two named Memory image assets. A heavier paper-textured heading matches the approved mockup more closely; no view-mode toggle or extra source scanning is introduced.

Tests cover authenticated read-only HTTP access, traversal and junction rejection, tier listing, oversized documents, title search, raw reading and refresh. Browser verification covers the actual bundled page, source selection and responsive layout. Only the active Vault Memory folder is indexed; archived months outside it and full-text search are not included. The root AGENTS.md now records the owner's requirement to minimize upstream coupling and prefer appropriate plugin boundaries for future customizations.
