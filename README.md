# GGBro Router for ComfyUI

A small ComfyUI node suite for clean channel-based routing.

It is designed to help build modular workflows with explicit branching, while keeping everything visible in the graph.

It is especially useful for rapidly switching between multiple model pipelines inside the same ComfyUI workflow.

---

## Included Nodes

### 1) `GGBro Channel Selector`

A simple channel selector.

**Input**

* `select`: integer channel (`1..8`)

**Output**

* `selected_channel`

**Use case**

* Drive multiple routing nodes with the same selected channel
* Keep channel selection centralized and readable

---

### 2) `GGBro Router OUT (Any)`

A **1 → 8** router.

It sends one input into the selected output channel.

**Inputs**

* `in` (optional): any data
* `select`: integer channel (`1..8`)

**Outputs**

* `selected_channel`
* `out1 ... out8`

**Behavior**

* Only `out[select]` receives the input value
* All other outputs return an `ExecutionBlocker` for hard gating

**Typical use**

* Send one prompt, latent, image, or value into one branch only
* Cleanly activate one branch without passing data into all others

---

### 3) `GGBro Router IN (Any)`

An **8 → 1** router.

It returns only the input corresponding to the selected channel.

**Inputs**

* `in1 ... in8` (optional)
* `select`: integer channel (`1..8`)

**Outputs**

* `selected_channel`
* `out`

**Behavior**

* Only the selected input is forwarded to `out`
* If the selected input is missing or blocked, the node returns an `ExecutionBlocker`

**Typical use**

* Merge multiple alternative branches back into a single output
* Select one result from several model / image / latent branches

---

### 4) `GGBro Set (Any)`

Global Set node by key.

**Inputs**

* `key` (string)
* `value` (any)
* `respond_channel` (int)
* `selected_channel` (optional)

**Outputs**

* `value`
* `sync`

**Behavior**

* Writes only when `selected_channel == respond_channel`
* Ignores `None` and blocked values
* Stores the value globally under the given key

**Typical use**

* Lightweight keyed storage for modular workflows
* Passing values across distant parts of a graph when explicit routing is inconvenient

> Note: for core pipeline resources such as `MODEL`, `CLIP`, and `VAE`, explicit graph routing with `Router OUT` / `Router IN` is usually more robust than global Set/Get.

---

### 5) `GGBro Get (Any)`

Global Get node by key.

**Inputs**

* `key` (string)
* `default` (optional)
* `sync` (optional)

**Outputs**

* `value`

**Behavior**

* Returns the stored value for `key`
* If missing, returns `default` if provided
* Otherwise returns a safe fallback placeholder

---

## Routing Model

The node suite is built around a simple idea:

* **Channel Selector** chooses the active channel
* **Router OUT** sends data into one branch
* **Router IN** collects data back from one branch

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
```

### Merge back

Collect one result back from multiple branches:

```text
branch1 ─┐
branch2 ─┼─> Router IN (select = 2) ──> output
branch3 ─┘
```

### Shared selection

Drive both nodes from the same selector:

```text
Channel Selector
   └─ selected_channel ──> Router OUT
   └─ selected_channel ──> Router IN
```

---

## Why this exists

There are already several ComfyUI node packs that touch flow control, switching, or conditional execution.

Examples include:

* **ControlFlowUtils**, which provides advanced flow control utilities such as Universal Switches and Memory Storages
* **ComfyUI-Interactive**, which provides Interactive Selectors and Interactive Switches for user-driven path selection
* **Comfyroll Custom Nodes**, which includes several Process Switch nodes as part of a much larger utility suite

So why make **GGBro Router**?

Because this project focuses on a narrower goal:

* **simple channel-based routing**
* **clean graph readability**
* **minimal mental overhead**
* **small node set**
* **generic `Any` routing**
* **explicit branching inside the DAG**

In other words, this project is not trying to be a full control-flow framework.

It is meant to provide a small, predictable, easy-to-read routing toolkit based on:

* `GGBro Channel Selector`
* `GGBro Router OUT`
* `GGBro Router IN`
* optionally `GGBro Set / Get`

---

## How it differs from similar nodes

### Compared to ControlFlowUtils

ControlFlowUtils is broader and more feature-rich.
It includes logic, branching, memory, and more advanced flow-control patterns.

**GGBro Router** is intentionally smaller:

* fewer concepts
* easier to read in large workflows
* centered on channel selection and routing only

### Compared to ComfyUI-Interactive

ComfyUI-Interactive is built around interactive execution and user-triggered path selection.

**GGBro Router** is not primarily about UI interactivity.
It is designed for structural graph routing:

* select a channel
* send data into one branch
* collect data back from one branch

### Compared to Comfyroll switches

Comfyroll includes switching and process-routing utilities as part of a very large toolbox.

**GGBro Router** aims to stay lightweight and focused:

* one routing model
* one naming convention
* one mental model

---

## Design philosophy

This node pack prefers:

* explicit routing over hidden behavior
* small reusable nodes over large multi-purpose logic nodes
* graph clarity over feature density

The goal is to make modular workflows easier to build and easier to understand at a glance.

---

## Best fit

GGBro Router is especially useful when you want to:

* branch one input into multiple alternative workflow sections
* merge several alternative branches back into one output
* keep branch selection centralized with a single channel selector
* avoid messy blocker-heavy graphs
* build modular stage-based workflows that remain readable
* quickly switch between different model pipelines from the same workflow

For example:

* switch between different `MODEL / CLIP / VAE` stacks
* compare Qwen vs Z-Image vs other model families
* toggle between multiple generation setups without rewiring the graph
* keep one unified downstream workflow while changing only the active model branch

---

## Example use case: fast model switching

One of the main use cases for GGBro Router is quickly switching between different model setups inside the same workflow.

Example:

* Branch 1: Qwen Image Edit pipeline
* Branch 2: Z-Image pipeline
* Branch 3: another model family or experimental setup

Using a shared `GGBro Channel Selector`, you can route:

* `MODEL`
* `CLIP`
* `VAE`
* optional extras such as ControlNet / model patches

into a single downstream workflow.

This makes it easy to:

* compare outputs across model families
* reuse the same prompt / latent / image logic
* avoid reconnecting nodes every time you want to test a different setup

---

## Not trying to replace everything

This project does **not** try to replace:

* full logic/control-flow frameworks
* interactive UI selector systems
* large all-in-one utility suites

Instead, it offers a focused routing layer that can coexist with them.

---

## Installation

Clone into your `ComfyUI/custom_nodes` folder:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/GGBroX/ComfyUI-Router.git
```

Then restart ComfyUI.

---

## Notes

* Channels are currently **static** (`1..8`)
* The nodes are intended to stay simple and predictable
* `ExecutionBlocker` is used for hard gating on inactive routes

---

## Legacy Compatibility

Older workflows may still reference:

* `GGBro Router`

This is treated as the legacy name for the original router behavior, now represented by:

* `GGBro Router OUT`

---

## Suggested usage

Best use cases:

* branching prompts
* branching latents
* branching image paths
* selecting one result from multiple alternatives
* quickly switching between different model pipelines
* building modular stage-based workflows

Less ideal use cases:

* treating the graph like a fully global variable system
* hiding critical pipeline dependencies that are clearer when wired explicitly

---

## License

MIT
