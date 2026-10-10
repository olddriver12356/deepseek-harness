---
description: "Opt-in independent Session discussion for an existing Web profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-collaboration

## Summary

This reference defines the optional discussion bundle installed after `dsh-base` and `dsh-web-app`. It adds the [Host discussion service](../../host/collaboration/README.md), its discussion tools and the [browser connection controls](../../client/ui-collaboration/README.md). Default profiles contain no collaboration rows.

## Table of Contents

- [Configuration](#configuration)
- [Composition ownership](#composition-ownership)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="configuration"></a>
## Configuration

Add this package to the Web profile's bundle list through the [profile plugin manager](../../boot/app-boot/README.md). Before launching `dsh --profile web`, supply positive integer deployment bounds in `DSH_COLLABORATION_MAX_MESSAGE_BYTES`, `DSH_COLLABORATION_MAX_STATE_BYTES`, `DSH_COLLABORATION_MAX_JOURNAL_ENTRIES` and `DSH_COLLABORATION_MAX_REQUESTS`. Missing or invalid values fail Host configuration validation. Alternatively, replace the complete `collaboration` row configuration in a later profile patch using the Host package's documented fields.

The bundle explicitly permits `read`, `glob`, `grep`, `collaboration_status` and `peer_send` during Peer turns. Mounting the tools alone does not grant these permissions. The human must create each connection, accept disclosure and supply its activation limit through the connection controls. The bundle supplies no activation budget.

<a id="composition-ownership"></a>
## Composition ownership

The manifest ships the patch and both runtime entry faces of its dependency graph. Browser code is owned by the Client package; generated Remote bindings remain owned by the API and Host packages. No invariant companion is published because this static bundle has no mutable runtime observations.

<a id="dev-note"></a>
## Dev Note

The assembled test uses the shipped Web profile with an isolated overlay and explicit deployment bounds. Recording and keyless replay preserve two ordinary Session roles and exercise complete Host restart. The shared Host/tool build must retain one authority marker instance across its public entries.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the Host discussion service and its tool entry, which own the framed Peer input, tool schemas and discussion guidance.

#### KV Cache effect

The bundle adds no request text itself. The Host owner defines the prompt, schema and appended message effects.

## Known Limitations and Deferred Work

- Discussion connects ordinary independently created Sessions in one Host. It preserves their identities, working directories, models and private conversations. Plans, task claims, implementation, review and integration are unavailable. Same-user Host credentials do not isolate action authority or establish an unforgeable human channel; this bundle does not enable those workflows.
