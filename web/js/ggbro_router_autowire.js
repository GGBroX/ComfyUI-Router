import { app } from "/scripts/app.js";

const ROUTER = "GGBro Router";
const SET = "GGBro Set";
const GET = "GGBro Get";

function isNode(node, cls) {
  return node?.comfyClass === cls || node?.type === cls || node?.title === cls;
}
function isRelevantNode(node) {
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

// Legge il select del Router collegato al Set tramite input "selected_channel"
function readSelectedFromRouterViaSet(graph, setNode) {
  const idx = setNode?.inputs?.findIndex(i => i?.name === "selected_channel") ?? -1;
  if (idx < 0) return null;

  const inp = setNode.inputs[idx];
  if (!inp || inp.link == null) return null;

  const link = graph.links?.[inp.link];
  if (!link) return null;

  const origin = graph.getNodeById?.(link.origin_id);
  if (!origin || !isNode(origin, ROUTER)) return null;

  const w = origin.widgets?.find(w => w?.name === "select");
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

  // hide sync pins
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

    // ✅ CLEANUP SEMPRE
    removeIncomingLinks(graph, g, getSync);

    const k = keyOf(g);
    if (!k) continue;

    const candidates = setsByKey.get(k) || [];
    if (!candidates.length) continue;

    // Leggi canale selezionato dal Router (via input selected_channel del Set)
    let selected = null;
    for (const s of candidates) {
      selected = readSelectedFromRouterViaSet(graph, s);
      if (selected != null) break;
    }

    // se non troviamo Router o selected, non colleghiamo nulla
    if (selected == null) continue;

    // trova set attivo
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
    // patchiamo SOLO i nostri nodi (meno overhead)
    if (![ROUTER, SET, GET].includes(nodeData.name)) return;

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
    // startup: workflow load + UI init
    setTimeout(schedule, 150);
    setTimeout(schedule, 500);
    setTimeout(schedule, 1200);
  }
});