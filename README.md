# GGBro Router for ComfyUI

A small ComfyUI node suite for clean channel-based routing.

It is designed to help build modular workflows with explicit branching, while keeping everything visible in the graph.

## Included Nodes

### 1) `GGBro Channel Selector`
A simple channel selector.

**Input**
- `select`: integer channel (`1..8`)

**Output**
- `selected_channel`

**Use case**
- Drive multiple routing nodes with the same selected channel.
- Keep channel selection centralized and readable.

---

### 2) `GGBro Router OUT (Any)`
A **1 → 8** router.

It sends one input into the selected output channel.

**Inputs**
- `in` (optional): any data
- `select`: integer channel (`1..8`)

**Outputs**
- `selected_channel`
- `out1 ... out8`

**Behavior**
- Only `out[select]` receives the input value.
- All other outputs return an `ExecutionBlocker` for hard gating.

**Typical use**
- Send one prompt, latent, image, or value into one branch only.
- Cleanly activate one branch without passing data into all others.

---

### 3) `GGBro Router IN (Any)`
An **8 → 1** router.

It returns only the input corresponding to the selected channel.

**Inputs**
- `in1 ... in8` (optional)
- `select`: integer channel (`1..8`)

**Outputs**
- `selected_channel`
- `out`

**Behavior**
- Only the selected input is forwarded to `out`.
- If the selected input is missing or blocked, the node returns an `ExecutionBlocker`.

**Typical use**
- Merge multiple alternative branches back into a single output.
- Select one result from several model / image / latent branches.

---

### 4) `GGBro Set (Any)`
Global Set node by key.

**Inputs**
- `key` (string)
- `value` (any)
- `respond_channel` (int)
- `selected_channel` (optional)

**Outputs**
- `value`
- `sync`

**Behavior**
- Writes only when `selected_channel == respond_channel`
- Ignores `None` and blocked values
- Stores the value globally under the given key

**Typical use**
- Lightweight keyed storage for modular workflows
- Passing values across distant parts of a graph when explicit routing is inconvenient

> Note: for core pipeline resources such as `MODEL`, `CLIP`, and `VAE`, explicit graph routing with `Router OUT` / `Router IN` is usually more robust than global Set/Get.

---

### 5) `GGBro Get (Any)`
Global Get node by key.

**Inputs**
- `key` (string)
- `default` (optional)
- `sync` (optional)

**Outputs**
- `value`

**Behavior**
- Returns the stored value for `key`
- If missing, returns `default` if provided
- Otherwise returns a safe fallback placeholder

---

## Routing Model

The node suite is built around a simple idea:

- **Channel Selector** chooses the active channel
- **Router OUT** sends data into one branch
- **Router IN** collects data back from one branch

This makes workflows easier to read than large blocker/merge constructions and keeps routing explicit inside the ComfyUI graph.

---

## Example

### Branch out
Use one input and route it into one of several branches:

```text
Prompt/Image/Latent
        |
   Router OUT
   select = 2
        |
   out2 only
