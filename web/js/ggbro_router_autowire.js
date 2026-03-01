import { app } from "/scripts/app.js";

const ROUTER = "GGBro Router";
const SET = "GGBro Set";
const GET = "GGBro Get";

function isNode(node, cls) {
  return node?.comfyClass === cls || node?.type === cls || node?.title === cls;
}
function isRelevant(node) {
  return isNode(node, ROUTER) || isNode(node, SET) || isNode(node, GET);
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

function originNodeFromInput(graph, node, inputName) {
  const idx = node?.inputs?.findIndex(i => i?.name === inputName) ?? -1;
  if (idx < 0) return null;
  const inp = node.inputs[idx];
  if (!inp || inp.link == null) return null;
  const link = graph.links?.[inp.link];
  if (!link) return null;
  return graph.getNodeById?.(link.origin_id) ?? null;
}

// Risale upstream dal ramo "value" del Set per trovare il Router reale
function findUpstreamRouterFromSetValue(graph, setNode, maxDepth = 10) {
  const start = originNodeFromInput(graph, setNode, "value");
  if (!start) return null;

  const q = [{ n: start, d: 0 }];
  const seen = new Set();
  if (start.id != null) seen.add(start.id);

  while (q.length) {
    const { n, d } = q.shift();
    if (!n) continue;
    if (isNode(n, ROUTER)) return n;
    if (d >= maxDepth) continue;

    for (const inp of (n.inputs || [])) {
      if (!inp || inp.link == null) continue;
      const link = graph.links?.[inp.link];
      if (!link) continue;
      const on = graph.getNodeById?.(link.origin_id);
      if (!on) continue;
      if (on.id != null && seen.has(on.id)) continue;
      if (on.id != null) seen.add(on.id);
      q.push({ n: on, d: d + 1 });
    }
  }

  return null;
}

function readRouterSelect(routerNode) {
  const w = routerNode?.widgets?.find(w => w?.name === "select");
  const sel = Number(w?.value);
  return Number.isFinite(sel) ? sel : null;
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => { scheduled = false; wire(); }, 60);
}

function wire() {
  const graph = app.graph;
  if (!graph) return;

  const nodes = graph._nodes || [];
  const sets = nodes.filter(n => isNode(n, SET));
  const gets = nodes.filter(n => isNode(n, GET));

  // nascondi sync pins
  for (const s of sets) hideIO(s, "sync", false);
  for (const g of gets) hideIO(g, "sync", true);

  // map key -> sets
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

    // ✅ CLEANUP SEMPRE: se non trovi match, deve restare scollegato
    removeIncomingLinks(graph, g, getSync);

    const k = keyOf(g);
    if (!k) continue;

    const candidates = setsByKey.get(k) || [];
    if (!candidates.length) continue;

    // trova un router reale risalendo dal ramo value (robusto anche con nodi intermedi)
    let selected = null;
    for (const s of candidates) {
      const router = findUpstreamRouterFromSetValue(graph, s);
      if (!router) continue;
      selected = readRouterSelect(router);
      if (selected != null) break;
    }
    if (selected == null) continue; // se non c'è router, non colleghiamo nulla

    const active = candidates.find(s => Number(widget(s, "respond_channel")?.value ?? 1) === selected);
    if (!active) continue;

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
    const _c = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = _c ? _c.apply(this, arguments) : undefined;
      if (isRelevant(this)) schedule();
      return r;
    };

    const _w = nodeType.prototype.onWidgetChanged;
    nodeType.prototype.onWidgetChanged = function () {
      const r = _w ? _w.apply(this, arguments) : undefined;
      if (isRelevant(this)) schedule();
      return r;
    };

    const _p = nodeType.prototype.onPropertyChanged;
    nodeType.prototype.onPropertyChanged = function () {
      const r = _p ? _p.apply(this, arguments) : undefined;
      if (isRelevant(this)) schedule();
      return r;
    };

    const _cc = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const r = _cc ? _cc.apply(this, arguments) : undefined;
      if (isRelevant(this)) schedule();
      return r;
    };

    const _rm = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      const r = _rm ? _rm.apply(this, arguments) : undefined;
      schedule(); // se rimuovi un Set/Get/Router, ripulisce i sync
      return r;
    };
  },

  setup() {
    // ✅ startup: più passaggi per coprire load workflow + init UI
    setTimeout(schedule, 150);
    setTimeout(schedule, 500);
    setTimeout(schedule, 1200);
  }
});