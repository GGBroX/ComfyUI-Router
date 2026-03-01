# GGBro Router (Any) — Router + Global Set/Get for ComfyUI

A small ComfyUI node suite designed to:
- **route** one input into multiple branches (hard gating with blockers),
- **store** a value into a global variable **by key** (no `A_0`, `A_1` when you copy nodes),
- **retrieve** that global value anywhere,
- and **auto-wire** a hidden “sync” connection so the active Set is always synchronized with the matching Get.

> Goal: modular “stage” workflows, clean branching, no blocker/merge hell, and no duplicated variables when copy/pasting Set nodes.

---

## Included Nodes

### 1) `GGBro Router (Any)`
**1 → N** router (demux).

**Inputs**
- `in` *(optional)*: any data
- `select`: integer channel (1..N)

**Outputs**
- `selected_channel`: the current channel
- `out1..outN`: only `out[select]` receives `in`, all others output an **ExecutionBlocker** (hard gating)

**Notes**
- If `in` is not connected, the Router can still be used as a “controller” (it outputs `selected_channel`), but the `out*` ports won’t carry meaningful payload.

---

### 2) `GGBro Set (Any)`
Global Set “no suffix” (unique by key).

**Inputs**
- `key` (string)
- `value` (any)
- `respond_channel` (int)
- `selected_channel` *(optional)*: usually connected from `Router.selected_channel`

**Outputs**
- `value` (pass-through)
- `sync` (internal “virtual wire” helper)

**Behavior**
- If `selected_channel != respond_channel` → **does not write**
- If `value` is `None` or a blocker → **does not write**
- Otherwise writes into a global store under `key`.

---

### 3) `GGBro Get (Any)`
Global Get “no suffix” (reads by key).

**Inputs**
- `key` (string)
- `default` *(optional)*
- `sync` *(optional / auto-wired)*

**Output**
- `value`

**Behavior**
- If a valid value exists for `key`, returns it
- If missing, returns `default` (if provided), otherwise returns a safe placeholder (e.g. a small black image) to avoid crashing Preview nodes.

---

## Installation

### Option A — Git clone (recommended)
Inside `ComfyUI/custom_nodes/`:

```bash
git clone https://github.com/<YOUR_USER>/<YOUR_REPO>.git GGBro_Router
