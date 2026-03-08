import { app } from "/scripts/app.js";

const CHANNEL_SELECTOR = "GGBro Channel Selector";
const ROUTER_LEGACY = "GGBro Router";
const ROUTER_IN = "GGBro Router IN";
const ROUTER_OUT = "GGBro Router OUT";
const SWITCH = "GGBro Switch";
const SET = "GGBro Set";
const GET = "GGBro Get";

const ROUTE_LIKE = new Set([
  CHANNEL_SELECTOR,
  ROUTER_LEGACY,
  ROUTER_IN,
  ROUTER_OUT,
  SWITCH,
]);

const RELEVANT = new Set([
  CHANNEL_SELECTOR,
  ROUTER_LEGACY,
  ROUTER_IN,
  ROUTER_OUT,
  SWITCH,
  SET,
  GET,
]);

function isNode(node, cls) {
  return node?.comfyClass === cls || node?.type === cls || node?.title === cls;
}

function isOneOf(node, classes) {
  for (const cls of classes) {
    if (isNode(node, cls)) return true;
  }
  return false;
}

function widget(node, name) {
  return node?.widgets?.find(w => w?.name === name) ?? null;
}

function keyOf(node) {
  return String(widget(node, "key")?.value ?? "");
}

function hideIO(node, name, isInput) {
  const arr = isInput ? node.inputs : node.outputs;
  const idx = arr?.findIndex(x => x?.name === name) ?? -1;
  if (idx >= 0 && arr[idx]) arr[idx].hidden = true;

  const w = widget(node, name);
  if (w) w.hidden = true;
}

function inIdx(node, name) {
  return node?.inputs?.findIndex(i => i?.name === name) ?? -1;
}

function outIdx(node, name) {
  return node?.outputs?.findIndex(o => o?.name === name) ?? -1;
}

function readSelectWidget(node) {
  const w = widget(node, "select");
  const sel = Number(w?.value);
  return Number.isFinite(sel) ? sel : null;
}

function removeIncomingLinks(graph, targetNode, targetSlot) {
  const links = graph?.links;
  if (!links) return;

  for (const id in links) {
    const l = links[id];
    if (l && l.target_id === targetNode.id && l.target_slot === targetSlot) {
      graph.removeLink(Number(id));
    }
  }
}

function currentIncomingLinkId(node, inputName) {
  const idx = inIdx(node, inputName);
  if (idx < 0) return null;
  const inp = node.inputs?.[idx];
  return inp?.link ?? null;
}

// legge il canale effettivo di UN set specifico
function readSelectedFromSet(graph, setNode) {
  const idx = inIdx(setNode, "selected_channel");
  if (idx >= 0) {
    const inp = setNode.inputs[idx];
    if (inp?.link != null) {
      const link = graph?.links?.[inp.link];
      if (link) {
        const origin = graph.getNodeById?.(link.origin_id);
        if (origin && isOneOf(origin, ROUTE_LIKE)) {
          const sel = readSelectWidget(origin);
          if (sel != null) return sel;
        }
      }
    }
  }

  const own = Number(widget(setNode, "selected_channel")?.value);
  return Number.isFinite(own) ? own : null;
}

function respondChannelOfSet(setNode) {
  const rc = Number(widget(setNode, "respond_channel")?.value);
  return Number.isFinite(rc) ? rc : 1;
}

function findActiveSetForKey(graph, setsForKey) {
  for (const s of setsForKey) {
    const selected = readSelectedFromSet(graph, s);
    const respond = respondChannelOfSet(s);
    if (selected != null && respond === selected) {
      return s;
    }
  }
  return null;
}

function isAlreadyLinked(graph, setNode, getNode) {
  const getSync = inIdx(getNode, "sync");
  const setSync = outIdx(setNode, "sync");
  if (getSync < 0 || setSync < 0) return false;

  const linkId = currentIncomingLinkId(getNode, "sync");
  if (linkId == null) return false;

  const link = graph?.links?.[linkId];
  if (!link) return false;

  return (
    link.origin_id === setNode.id &&
    link.origin_slot === setSync &&
    link.target_id === getNode.id &&
    link.target_slot === getSync
  );
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    wire();
  }, 80);
}

function wire() {
  const graph = app.graph;
  if (!graph) return;

  const nodes = graph._nodes || [];
  const sets = nodes.filter(n => isNode(n, SET));
  const gets = nodes.filter(n => isNode(n, GET));

  for (const s of sets) hideIO(s, "sync", false);
  for (const g of gets) hideIO(g, "sync", true);

  const setsByKey = new Map();
  for (const s of sets) {
    const k = keyOf(s);
    if (!k) continue;
    if (!setsByKey.has(k)) setsByKey.set(k, []);
    setsByKey.get(k).push(s);
  }

  for (const g of gets) {
    const getSync = inIdx(g, "sync");
    if (getSync < 0) continue;

    const k = keyOf(g);
    if (!k) {
      removeIncomingLinks(graph, g, getSync);
      continue;
    }

    const candidates = setsByKey.get(k) || [];
    if (!candidates.length) {
      removeIncomingLinks(graph, g, getSync);
      continue;
    }

    const active = findActiveSetForKey(graph, candidates);

    if (!active) {
      removeIncomingLinks(graph, g, getSync);
      continue;
    }

    if (isAlreadyLinked(graph, active, g)) {
      continue;
    }

    removeIncomingLinks(graph, g, getSync);

    const setSync = outIdx(active, "sync");
    if (setSync < 0) continue;

    try {
      active.connect(setSync, g, getSync);
    } catch (e) {
      graph.addLink(active.id, setSync, g.id, getSync, "INT");
    }
  }

  graph.setDirtyCanvas(true, true);
}

app.registerExtension({
  name: "GGBroRouter.AutoWire",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!RELEVANT.has(nodeData.name)) return;

    const _c = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = _c ? _c.apply(this, arguments) : undefined;
      schedule();
      return r;
    };

    const _w = nodeType.prototype.onWidgetChanged;
    nodeType.prototype.onWidgetChanged = function () {
      const r = _w ? _w.apply(this, arguments) : undefined;
      schedule();
      return r;
    };

    const _p = nodeType.prototype.onPropertyChanged;
    nodeType.prototype.onPropertyChanged = function () {
      const r = _p ? _p.apply(this, arguments) : undefined;
      schedule();
      return r;
    };

    const _cc = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const r = _cc ? _cc.apply(this, arguments) : undefined;
      schedule();
      return r;
    };

    const _rm = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      const r = _rm ? _rm.apply(this, arguments) : undefined;
      schedule();
      return r;
    };
  },

  setup() {
    setTimeout(schedule, 150);
    setTimeout(schedule, 500);
    setTimeout(schedule, 1200);
  }
});
