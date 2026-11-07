// NineDay StoryForge: drives StoryForge's own canvas (graph-editor.js on LiteGraph, loaded from
// /sf-assets as plain scripts) against the cloud flow graph doc. This is the web counterpart of
// StoryForge.Web's GraphEditorState: it builds the same payload the canvas takes (ToPayload), answers the
// same callbacks the canvas makes (FlowGraphPanel's [JSInvokable] methods) and turns 存檔 into the same
// diff (ApplyExportDiff) — except the result is written to Yjs as changes relative to what this editor
// loaded, so other people's saves in between are kept.
import * as Y from 'yjs';

import { SF_ASSETS_VERSION } from './shared/assets-version';
import {
  type CanonicalEdge,
  type CanonicalGraph,
  type CanonicalGroup,
  type CanonicalNode,
  createFlowGraph,
} from './shared/flowgraph';
import { createSchema } from './shared/schema';

export const sfFlow = createFlowGraph(Y);
const sfTables = createSchema(Y);
export const FLOW_LOCAL = 'sf-flow-local';

// Same defaults as StoryForge's AppSettings.
const SETTINGS = {
  nodeFrozenTextSize: 9,
  nodeMaxTextSize: 32,
  groupFrozenTextSize: 9.5,
  groupMaxTextSize: 40,
  groupPadding: 25.6,
  groupTitleBarHeight: 60,
  searchMinZoom: 0.5,
};
const PLAYSCRIPT_TYPE = 'playscript';
const PLAYSCRIPT_CONDITION_TYPE = 'playscript-flag';

type PortSchema = {
  FieldName: string;
  PortName: string;
  FieldType: string;
  AllowMultiple: boolean;
};
type NodeTypeSchema = {
  TypeName: string;
  MenuName?: string | null;
  DisplayName?: string | null;
  Inputs: PortSchema[];
  Outputs: PortSchema[];
  IdentityFields: { FieldName: string; FieldType: string }[];
};
export type NodeSchemaDoc = { Version: number; NodeTypes: NodeTypeSchema[] };

type LiteNode = {
  pos: [number, number];
  size: [number, number];
  _displayTitle?: string;
  flags: { pinned?: boolean };
};
type LiteCanvas = {
  ds: { scale: number; offset: [number, number] };
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  onDrawOverlay?: (ctx: CanvasRenderingContext2D) => void;
  setDirty(fg: boolean, bg?: boolean): void;
  selected_nodes?: Record<string, LiteNode>;
  deselectNode?(node: LiteNode): void;
  node_dragged?: unknown;
  connecting_node?: unknown;
  dragging_canvas?: boolean;
  resizing_node?: unknown;
  dragging_rectangle?: unknown;
  pointer_is_down?: boolean;
};
type CanvasApi = {
  _debug: {
    getCanvas(): LiteCanvas;
    getGraph(): { _nodes: LiteNode[] };
    guidByNode(): Map<LiteNode, string>;
  };
  init(canvasId: string, payload: unknown, ref: unknown): void;
  exportGraph(): {
    nodePositions: { guid: string; x: number; y: number }[];
    edges: {
      fromNodeGuid: string;
      fromPort: string;
      toNodeGuid: string;
      toPort: string;
    }[];
    newNodes: { guid: string; typeName: string; x: number; y: number }[];
    deletedNodeGuids: string[];
    groups: {
      clientId: string;
      title: string;
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      memberNodeGuids: string[];
    }[];
  };
  hasCanvasChanges(): boolean;
  markSaveSucceeded(): void;
  setGroupProperties(clientId: string, title: string, color: string): void;
  fitView(): void;
  updateNodeTitle(guid: string, title: string, hasIdentityTitle: boolean): void;
  applyRemoteChanges(changes: unknown): void;
  searchNode(query: string): unknown;
};

declare global {
  interface Window {
    storyForgeGraph?: CanvasApi;
    LiteGraph?: unknown;
  }
}

let scriptsLoading: Promise<CanvasApi> | null = null;
export function loadCanvasScripts(): Promise<CanvasApi> {
  scriptsLoading ??= (async () => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `/sf-assets/litegraph.css?v=${SF_ASSETS_VERSION}`;
    document.head.append(css);
    for (const src of [
      `/sf-assets/litegraph.min.js?v=${SF_ASSETS_VERSION}`,
      `/sf-assets/graph-editor.js?v=${SF_ASSETS_VERSION}`,
    ]) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`無法載入 ${src}`));
        document.head.append(s);
      });
    }
    if (!window.storyForgeGraph) throw new Error('流程圖畫布沒有載入');
    return window.storyForgeGraph;
  })();
  return scriptsLoading;
}

function toHex(c: { r: number; g: number; b: number }) {
  const b = (v: number) =>
    Math.max(0, Math.min(255, Math.floor(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${b(c.r)}${b(c.g)}${b(c.b)}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (!hex?.startsWith('#')) return null;
  let d = hex.slice(1);
  if (d.length === 3) d = [...d].map(ch => ch + ch).join('');
  if (d.length !== 6 || !/^[0-9a-f]+$/i.test(d)) return null;
  return {
    r: parseInt(d.slice(0, 2), 16) / 255,
    g: parseInt(d.slice(2, 4), 16) / 255,
    b: parseInt(d.slice(4, 6), 16) / 255,
  };
}

const identityOf = (n: { data: Record<string, unknown> }) => {
  const v = n.data.playscriptId ?? n.data.flagId;
  return v === undefined || v === null || v === '' ? '' : String(v);
};
const definesPlayscript = (type: string) => type !== PLAYSCRIPT_CONDITION_TYPE;

// 建立副本 numbering, ported from StoryForge.Core PlayscriptIdNumbering.
const SERIES = /^(?<scene>.+?_)(?<letter>[A-Za-z])(?<num>\d+)(?<desc>_.*)?$/;
function nextInSeries(source: string, existing: Set<string>): string | null {
  const m = SERIES.exec(source);
  if (!m?.groups) return null;
  const { scene, letter, num, desc = '' } = m.groups;
  let max = 0;
  for (const id of existing) {
    const x = SERIES.exec(id);
    if (x?.groups && x.groups.scene === scene && x.groups.letter === letter)
      max = Math.max(max, parseInt(x.groups.num, 10));
  }
  let n = (Math.floor(max / 10) + 1) * 10;
  let next: string;
  do {
    next = `${scene}${letter}${String(n).padStart(num.length, '0')}${desc}`;
    n += 10;
  } while (existing.has(next));
  return next;
}

export type SelectedNode = {
  guid: string;
  type: string;
  typeLabel: string;
  fields: { name: string; type: string; value: string }[];
};
export type SelectedGroup = { clientId: string; title: string; color: string };

export class FlowGraphEditor {
  /** What the canvas was built from; saves are written relative to this. */
  loaded: CanonicalGraph | null = null;
  private schema: NodeSchemaDoc = { Version: 0, NodeTypes: [] };
  private types = new Map<string, NodeTypeSchema>();
  /** Nodes as the editor currently sees them (loaded + field edits + nodes created this session). */
  private working = new Map<string, CanonicalNode>();
  private dirtyFields = false;
  private canvas: CanvasApi | null = null;

  onSelectNode: (n: SelectedNode | null) => void = () => {};
  onSelectGroup: (g: SelectedGroup | null) => void = () => {};
  onOpenTable: (guid: string) => void = () => {};
  onMessage: (text: string) => void = () => {};

  constructor(
    private readonly doc: Y.Doc,
    private readonly workspaceId: string,
    private readonly tableDoc: (guid: string) => Y.Doc,
    private readonly projectDoc: Y.Doc
  ) {}

  setSchema(json: string | null) {
    try {
      this.schema = json
        ? (JSON.parse(json) as NodeSchemaDoc)
        : { Version: 0, NodeTypes: [] };
    } catch {
      this.schema = { Version: 0, NodeTypes: [] };
    }
    this.types = new Map(this.schema.NodeTypes.map(t => [t.TypeName, t]));
  }

  get hasSchema() {
    return this.types.size > 0;
  }

  hasUnsavedChanges() {
    return this.dirtyFields || (this.canvas?.hasCanvasChanges() ?? false);
  }

  private typeLabel(type: string) {
    const t = this.types.get(type);
    return t?.DisplayName || type;
  }

  private titleOf(n: CanonicalNode) {
    const id = identityOf(n);
    return { title: id || this.typeLabel(n.type), hasIdentityTitle: !!id };
  }

  async mount(canvasId: string) {
    this.canvas = await loadCanvasScripts();
    this.reload(canvasId);
  }

  /** (Re)builds the canvas from the doc's current content. */
  reload(canvasId: string) {
    if (!this.canvas) return;
    this.loaded = sfFlow.readGraph(this.doc);
    this.working = new Map(
      this.loaded.nodes.map(n => [n.id, structuredClone(n)])
    );
    this.dirtyFields = false;
    this.canvas.init(
      canvasId,
      this.buildPayload(this.loaded),
      this.dotnetShim()
    );
    this.hookOverlay();
    this.applyLocks();
    this.onSelectNode(null);
    this.onSelectGroup(null);
  }

  // ---------- live editing ----------

  /** Mid-gesture: don't save, reload or move nodes under the user's hands. */
  /**
   * Set from window-level pointer events by the page. LiteGraph's own flags (pointer_is_down,
   * dragging_canvas, node_dragged...) stay set when the button is released outside the canvas, which used
   * to freeze syncing for good; they only count while the button is really down.
   */
  pointerDown = false;
  private pointerDownSince = 0;

  setPointerDown(down: boolean) {
    this.pointerDown = down;
    this.pointerDownSince = down ? Date.now() : 0;
  }

  isBusy() {
    const c = this.canvas?._debug.getCanvas();
    if (!c || !this.pointerDown) return false;
    // A gesture longer than a minute is treated as stuck, not as a real drag.
    if (Date.now() - this.pointerDownSince > 60_000) return false;
    return !!(
      c.node_dragged ||
      c.connecting_node ||
      c.dragging_canvas ||
      c.resizing_node ||
      c.dragging_rectangle
    );
  }

  /**
   * Takes in what others saved, applied to the canvas in place (graph-editor.js applyRemoteChanges):
   * moved/added/removed nodes and links, renamed nodes, group titles/colours/members. Only an added or
   * removed group, or a node whose type changed, needs a canvas rebuild ('structural').
   */
  takeRemote(): 'none' | 'applied' | 'structural' {
    if (!this.canvas || !this.loaded) return 'none';
    const remote = sfFlow.readGraph(this.doc);
    const base = this.loaded;
    const baseNodes = new Map(base.nodes.map(n => [n.id, n]));
    const remoteNodes = new Map(remote.nodes.map(n => [n.id, n]));
    const baseGroups = new Map(base.groups.map(g => [g.id, g]));
    const remoteGroups = new Map(remote.groups.map(g => [g.id, g]));
    if (
      baseGroups.size !== remoteGroups.size ||
      [...remoteGroups.keys()].some(id => !baseGroups.has(id))
    )
      return 'structural';
    for (const n of remote.nodes) {
      const b = baseNodes.get(n.id);
      if (b && b.type !== n.type) return 'structural';
    }
    const edgeKey = (e: CanonicalEdge) =>
      `${e.fromNode}.${e.fromPort}>${e.toNode}.${e.toPort}`;
    const toDto = (e: CanonicalEdge) => ({
      fromNodeGuid: e.fromNode,
      fromPort: e.fromPort,
      toNodeGuid: e.toNode,
      toPort: e.toPort,
    });
    const baseEdges = new Map(base.edges.map(e => [edgeKey(e), e]));
    const remoteEdges = new Map(remote.edges.map(e => [edgeKey(e), e]));
    const payload = this.buildPayload(remote);
    const dtoById = new Map(payload.nodes.map(n => [n.guid, n]));
    const changes = {
      removeNodes: base.nodes
        .filter(n => !remoteNodes.has(n.id))
        .map(n => n.id),
      addNodes: remote.nodes
        .filter(n => !baseNodes.has(n.id))
        .map(n => dtoById.get(n.id)),
      removeEdges: [...baseEdges]
        .filter(([k]) => !remoteEdges.has(k))
        .map(([, e]) => toDto(e)),
      addEdges: [...remoteEdges]
        .filter(([k]) => !baseEdges.has(k))
        .map(([, e]) => toDto(e)),
      positions: remote.nodes
        .filter(n => {
          const b = baseNodes.get(n.id);
          return (
            b &&
            (b.position.x !== n.position.x || b.position.y !== n.position.y)
          );
        })
        .map(n => ({ guid: n.id, x: n.position.x, y: n.position.y })),
      titles: remote.nodes
        .filter(n => {
          const b = baseNodes.get(n.id);
          return b && JSON.stringify(b.data) !== JSON.stringify(n.data);
        })
        .map(n => ({ guid: n.id, ...this.titleOf(n) })),
      groups: remote.groups
        .filter(g => {
          const b = baseGroups.get(g.id);
          return (
            b &&
            (b.title !== g.title ||
              JSON.stringify(b.color) !== JSON.stringify(g.color) ||
              JSON.stringify([...b.nodes].sort()) !==
                JSON.stringify([...g.nodes].sort()))
          );
        })
        .map(g => ({
          clientId: g.id,
          title: g.title,
          color: toHex(g.color),
          memberNodeGuids: [...g.nodes],
        })),
    };
    const count = Object.values(changes).reduce((a, v) => a + v.length, 0);
    if (!count) return 'none';
    // An older cached graph-editor.js has no in-place update: rebuild instead of failing every time.
    if (typeof this.canvas.applyRemoteChanges !== 'function')
      return 'structural';
    this.canvas.applyRemoteChanges(changes);
    this.loaded = remote;
    // Called right after this editor saved its own edits, so nothing local is pending to keep.
    this.working = new Map(remote.nodes.map(n => [n.id, structuredClone(n)]));
    this.applyLocks();
    return 'applied';
  }

  // ---------- presence ----------

  private peers: {
    id: number;
    name: string;
    color: string;
    cursor?: { x: number; y: number } | null;
    selected?: string | null;
    /** guid -> when they took it (ms since epoch). */
    locked?: Record<string, number>;
  }[] = [];
  /** Nodes someone else is dragging or editing right now -> who. */
  private lockedBy = new Map<string, { name: string; color: string }>();
  /** The node whose fields I am editing in the side panel (part of my locks). */
  editingGuid: string | null = null;

  private myId = 0;

  /** When I took each node I hold (kept while I keep holding it). */
  private mySince = new Map<string, number>();

  /**
   * Others' presence. A node someone holds (selected, dragged or edited) is locked for everyone else.
   * If two people take the same node, whoever took it first keeps it (lower client id on an exact tie);
   * both sides apply the same rule, so the other one drops it.
   */
  setPeers(peers: typeof this.peers, myId: number) {
    this.peers = peers;
    this.myId = myId;
    const owner = new Map<
      string,
      { since: number; id: number; name: string; color: string }
    >();
    for (const p of peers)
      for (const [g, since] of Object.entries(p.locked ?? {})) {
        const cur = owner.get(g);
        if (!cur || since < cur.since || (since === cur.since && p.id < cur.id))
          owner.set(g, { since, id: p.id, name: p.name, color: p.color });
      }
    this.lockedBy = new Map();
    for (const [g, o] of owner) {
      const mine = this.mySince.get(g);
      if (
        mine !== undefined &&
        (mine < o.since || (mine === o.since && this.myId < o.id))
      )
        continue;
      this.lockedBy.set(g, { name: o.name, color: o.color });
    }
    this.applyLocks();
    this.canvas?._debug.getCanvas().setDirty(true, false);
  }

  /** Centres the view on where someone is (their cursor, else their selected node). */
  focusPeer(id: number) {
    const p = this.peers.find(x => x.id === id);
    const c = this.canvas?._debug.getCanvas();
    if (!p || !c || !this.canvas) return false;
    let target = p.cursor ?? null;
    if (!target && p.selected) {
      for (const [node, guid] of this.canvas._debug.guidByNode())
        if (guid === p.selected)
          target = {
            x: node.pos[0] + node.size[0] / 2,
            y: node.pos[1] + node.size[1] / 2,
          };
    }
    if (!target) return false;
    const w = c.canvas.clientWidth;
    const h = c.canvas.clientHeight;
    c.ds.offset[0] = w / (2 * c.ds.scale) - target.x;
    c.ds.offset[1] = h / (2 * c.ds.scale) - target.y;
    c.setDirty(true, true);
    return true;
  }

  lockedByName(guid: string) {
    return this.lockedBy.get(guid)?.name ?? null;
  }

  /** Nodes I am controlling now (dragging, or editing in the side panel): broadcast so others can't touch them. */
  /** False while the tab is hidden or idle, so a forgotten selection doesn't keep others locked out. */
  holdSelection = true;

  /** What I hold, with when I took it; never a node someone else already holds. */
  myLocks(): Record<string, number> {
    // A click can still select a pinned node; drop it again so it can't ride along in a drag.
    if (this.lockedBy.size) this.applyLocks();
    const out = new Set<string>();
    const c = this.canvas?._debug.getCanvas();
    if (c && this.canvas) {
      const guids = this.canvas._debug.guidByNode();
      const held =
        this.holdSelection || c.node_dragged
          ? Object.values(c.selected_nodes ?? {})
          : [];
      if (c.node_dragged && !held.includes(c.node_dragged as LiteNode))
        held.push(c.node_dragged as LiteNode);
      for (const n of held) {
        const g = guids.get(n);
        if (g) out.add(g);
      }
    }
    if (this.editingGuid) out.add(this.editingGuid);
    const now = Date.now();
    const result: Record<string, number> = {};
    for (const g of [...out].sort()) {
      if (this.lockedBy.has(g)) continue;
      const since = this.mySince.get(g) ?? now;
      result[g] = since;
    }
    this.mySince = new Map(Object.entries(result));
    return result;
  }

  // A node someone else controls is pinned (LiteGraph won't start dragging it) and taken out of my
  // selection (so a multi-node drag can't carry it along).
  private applyLocks() {
    if (!this.canvas) return;
    const lite = this.canvas._debug;
    const c = lite.getCanvas();
    for (const [node, guid] of lite.guidByNode()) {
      const locked = this.lockedBy.has(guid);
      node.flags ??= {};
      if (!!node.flags.pinned !== locked) node.flags.pinned = locked;
      if (
        locked &&
        c.selected_nodes &&
        Object.values(c.selected_nodes).includes(node)
      )
        c.deselectNode?.(node);
    }
  }

  /** Canvas-space (graph) position of a mouse event, for sharing the cursor. */
  graphPoint(e: MouseEvent) {
    const c = this.canvas?._debug.getCanvas();
    if (!c) return null;
    const r = c.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / c.ds.scale - c.ds.offset[0],
      y: (e.clientY - r.top) / c.ds.scale - c.ds.offset[1],
    };
  }

  /** Chains onto the canvas overlay (re-done after every canvas rebuild). */
  private hookOverlay() {
    const c = this.canvas?._debug.getCanvas();
    if (!c) return;
    const own = c.onDrawOverlay;
    c.onDrawOverlay = (ctx: CanvasRenderingContext2D) => {
      own?.(ctx);
      if (ctx !== c.ctx || this.peers.length === 0) return;
      const { scale, offset } = c.ds;
      const lite = this.canvas?._debug;
      const byGuid = new Map<string, LiteNode>();
      if (lite)
        for (const [node, guid] of lite.guidByNode()) byGuid.set(guid, node);
      ctx.save();
      for (const [guid, who] of this.lockedBy) {
        const n = byGuid.get(guid);
        if (!n) continue;
        const label = `🔒 ${who.name}`;
        ctx.font = '12px sans-serif';
        const w = ctx.measureText(label).width + 10;
        const x = (n.pos[0] + offset[0]) * scale;
        const y = (n.pos[1] - 30 + offset[1]) * scale - 22;
        ctx.fillStyle = who.color;
        ctx.fillRect(x, y, w, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + 5, y + 13);
      }
      for (const p of this.peers) {
        const sel = p.selected ? byGuid.get(p.selected) : undefined;
        if (sel) {
          const title = 30;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3;
          ctx.strokeRect(
            (sel.pos[0] + offset[0]) * scale - 4,
            (sel.pos[1] - title + offset[1]) * scale - 4,
            sel.size[0] * scale + 8,
            (sel.size[1] + title) * scale + 8
          );
        }
        if (p.cursor) {
          const x = (p.cursor.x + offset[0]) * scale;
          const y = (p.cursor.y + offset[1]) * scale;
          const w = c.canvas.clientWidth;
          const h = c.canvas.clientHeight;
          if (x < 0 || y < 0 || x > w || y > h) {
            // Off screen: a marker on the edge, pointing at where they are.
            const m = 18;
            const ex = Math.min(w - m, Math.max(m, x));
            const ey = Math.min(h - m, Math.max(m, y));
            const ang = Math.atan2(y - ey, x - ex);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.moveTo(ex + Math.cos(ang) * 16, ey + Math.sin(ang) * 16);
            ctx.lineTo(
              ex + Math.cos(ang + 2.5) * 9,
              ey + Math.sin(ang + 2.5) * 9
            );
            ctx.lineTo(
              ex + Math.cos(ang - 2.5) * 9,
              ey + Math.sin(ang - 2.5) * 9
            );
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.arc(ex, ey, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.name.slice(0, 1), ex, ey + 4);
            ctx.font = '11px sans-serif';
            const lw = ctx.measureText(p.name).width + 8;
            const lx = Math.min(w - lw - 2, Math.max(2, ex - lw / 2));
            const ly = ey > h / 2 ? ey - 32 : ey + 14;
            ctx.fillStyle = p.color;
            ctx.fillRect(lx, ly, lw, 16);
            ctx.fillStyle = '#fff';
            ctx.fillText(p.name, lx + lw / 2, ly + 12);
            ctx.textAlign = 'start';
            continue;
          }
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + 18);
          ctx.lineTo(x + 5, y + 13);
          ctx.lineTo(x + 12, y + 13);
          ctx.closePath();
          ctx.fill();
          ctx.font = '12px sans-serif';
          const tw = ctx.measureText(p.name).width + 10;
          ctx.fillRect(x + 12, y + 14, tw, 18);
          ctx.fillStyle = '#fff';
          ctx.fillText(p.name, x + 17, y + 27);
        }
      }
      ctx.restore();
    };
  }

  fitView() {
    this.canvas?.fitView();
  }
  search(q: string) {
    return this.canvas?.searchNode(q);
  }

  private buildPayload(g: CanonicalGraph) {
    const nodeTypes = this.schema.NodeTypes.map(t => ({
      typeName: t.TypeName,
      displayName: t.DisplayName || t.TypeName,
      menuName: t.MenuName ?? '',
      inputs: t.Inputs.map(p => ({
        fieldName: p.FieldName,
        portName: p.PortName,
        allowMultiple: p.AllowMultiple,
      })),
      outputs: t.Outputs.map(p => ({
        fieldName: p.FieldName,
        portName: p.PortName,
        allowMultiple: false,
      })),
      identityFields: t.IdentityFields.map(f => f.FieldName),
    }));
    const byId = new Map(g.nodes.map(n => [n.id, n]));
    const groups = g.groups.map(gr => {
      const members = gr.nodes
        .map(id => byId.get(id))
        .filter((n): n is CanonicalNode => !!n);
      let { x, y, width, height } = gr.position;
      if (members.length) {
        const minX = Math.min(...members.map(n => n.position.x));
        const minY = Math.min(...members.map(n => n.position.y));
        const maxX = Math.max(
          ...members.map(n => n.position.x + n.position.width)
        );
        const maxY = Math.max(
          ...members.map(n => n.position.y + n.position.height)
        );
        x = minX - SETTINGS.groupPadding;
        y = minY - SETTINGS.groupTitleBarHeight;
        width = maxX - minX + SETTINGS.groupPadding * 2;
        height =
          maxY - minY + SETTINGS.groupTitleBarHeight + SETTINGS.groupPadding;
      }
      return {
        clientId: gr.id,
        title: gr.title,
        x,
        y,
        width,
        height,
        color: toHex(gr.color),
        memberNodeGuids: [...gr.nodes],
      };
    });
    this.shownGroupBounds = new Map(
      groups.map(gr => [
        gr.clientId,
        { x: gr.x, y: gr.y, width: gr.width, height: gr.height },
      ])
    );
    return {
      nodeTypes,
      nodes: g.nodes.map(n => ({
        guid: n.id,
        typeName: n.type,
        ...this.titleOf(n),
        x: n.position.x,
        y: n.position.y,
        width: n.position.width,
        height: n.position.height,
        fields: Object.fromEntries(
          Object.entries(n.data).map(([k, v]) => [
            k,
            v === null || v === undefined ? '' : String(v),
          ])
        ),
      })),
      edges: g.edges.map(e => ({
        fromNodeGuid: e.fromNode,
        fromPort: e.fromPort,
        toNodeGuid: e.toNode,
        toPort: e.toPort,
      })),
      groups,
      settings: SETTINGS,
      readOnly: false,
    };
  }
  private shownGroupBounds = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();

  private newNode(
    guid: string,
    type: string,
    x: number,
    y: number
  ): CanonicalNode {
    const t = this.types.get(type);
    const data: Record<string, unknown> = {};
    for (const f of t?.IdentityFields ?? [])
      data[f.FieldName] = f.FieldType === 'System.Int32' ? 0 : '';
    return {
      id: guid,
      type,
      position: { x, y, width: 220, height: 140 },
      data,
    };
  }

  private livePlayscriptIds(except?: string) {
    const ids = new Set<string>();
    for (const n of this.working.values()) {
      if (n.id === except || !definesPlayscript(n.type)) continue;
      const v = n.data.playscriptId;
      if (typeof v === 'string' && v) ids.add(v);
    }
    return ids;
  }

  private uniquePlayscriptId(guid: string, candidate: string) {
    const taken = this.livePlayscriptIds(guid);
    if (!taken.has(candidate)) return candidate;
    let i = 1;
    while (taken.has(`${candidate}_${i}`)) i++;
    this.onMessage(
      `識別碼「${candidate}」與其他節點重複，已自動改為「${candidate}_${i}」`
    );
    return `${candidate}_${i}`;
  }

  selectedNode(guid: string): SelectedNode | null {
    const n = this.working.get(guid);
    if (!n) return null;
    const t = this.types.get(n.type);
    return {
      guid,
      type: n.type,
      typeLabel: this.typeLabel(n.type),
      fields: (t?.IdentityFields ?? []).map(f => ({
        name: f.FieldName,
        type: f.FieldType,
        value:
          n.data[f.FieldName] === undefined ? '' : String(n.data[f.FieldName]),
      })),
    };
  }

  /** Sidebar field edit; returns the value actually stored (playscriptId is made unique). */
  setField(guid: string, field: string, raw: string) {
    const owner = this.lockedBy.get(guid);
    if (owner) {
      this.onMessage(`${owner.name} 正在動這個節點，等一下再改。`);
      return String(this.working.get(guid)?.data[field] ?? '');
    }
    const n = this.working.get(guid);
    if (!n) return raw;
    const t = this.types.get(n.type);
    const ft = t?.IdentityFields.find(f => f.FieldName === field)?.FieldType;
    let value: string | number = raw;
    if (ft === 'System.Int32') value = Number.parseInt(raw, 10) || 0;
    else if (field === 'playscriptId' && definesPlayscript(n.type) && raw)
      value = this.uniquePlayscriptId(guid, raw);
    n.data[field] = value;
    this.dirtyFields = true;
    const { title, hasIdentityTitle } = this.titleOf(n);
    this.canvas?.updateNodeTitle(guid, title, hasIdentityTitle);
    return String(value);
  }

  setGroup(clientId: string, title: string, color: string) {
    this.canvas?.setGroupProperties(clientId, title, color);
  }

  memoText(guid: string) {
    return sfFlow.memoText(this.doc, guid);
  }

  private dotnetShim() {
    const handlers: Record<string, (...args: any[]) => unknown> = {
      OnNodeCreated: (guid: string, type: string, x: number, y: number) => {
        if (!this.working.has(guid))
          this.working.set(guid, this.newNode(guid, type, x, y));
      },
      OnNodeUndoRemoved: (guid: string) => {
        if (!this.loaded?.nodes.some(n => n.id === guid))
          this.working.delete(guid);
      },
      OnUnsavedNodeRemoved: (guid: string) => {
        if (!this.loaded?.nodes.some(n => n.id === guid))
          this.working.delete(guid);
      },
      OnNodeSelectionChanged: (guid: string | null) =>
        this.onSelectNode(guid ? this.selectedNode(guid) : null),
      OnGroupSelectionChanged: (info: SelectedGroup | null) =>
        this.onSelectGroup(info),
      GetNodeContextMenuInfo: (guid: string) => {
        const n = this.working.get(guid);
        const name = n && n.type === PLAYSCRIPT_TYPE ? identityOf(n) : '';
        return {
          playscriptName: name,
          hasScriptFile: !!name,
          isOnPipeline: false,
          hasLdtkLocation: false,
        };
      },
      OpenScriptTableForGuid: (guid: string) => this.onOpenTable(guid),
      JumpToPipelineForGuid: () =>
        this.onMessage('網頁版沒有管線狀態，請在本機 StoryForge 查看。'),
      LocateInLdtkForGuid: () =>
        this.onMessage('網頁版不能開 LDtk，請在本機 StoryForge 定位。'),
      CopyPlayscriptNames: (guids: string[]) =>
        guids
          .flatMap(g => {
            const n = this.working.get(g);
            return n ? [identityOf(n)] : [];
          })
          .filter(Boolean)
          .join('\n'),
      DuplicateNode: (
        sourceGuid: string,
        newGuid: string,
        x: number,
        y: number
      ) => {
        const src = this.working.get(sourceGuid);
        if (!src || this.working.has(newGuid)) return null;
        const n = this.newNode(newGuid, src.type, x, y);
        for (const [k, v] of Object.entries(src.data)) {
          let value = v;
          if (
            k === 'playscriptId' &&
            definesPlayscript(n.type) &&
            typeof v === 'string' &&
            v
          ) {
            const ids = this.livePlayscriptIds();
            value = nextInSeries(v, ids) ?? this.uniquePlayscriptId(newGuid, v);
          }
          n.data[k] = value;
        }
        this.working.set(newGuid, n);
        this.dirtyFields = true;
        return {
          ...this.titleOf(n),
          fields: Object.fromEntries(
            Object.entries(n.data).map(([k, v]) => [k, String(v ?? '')])
          ),
        };
      },
    };
    return {
      invokeMethodAsync: async (name: string, ...args: unknown[]) => {
        const h = handlers[name];
        if (!h) {
          console.warn('[storyforge] canvas callback not handled', name);
          return null;
        }
        return h(...args);
      },
    };
  }

  /** 存檔: canvas export + sidebar edits -> the edited graph, written relative to what was loaded. */
  save(): { nodes: number; edges: number; groups: number; tables: number } {
    if (!this.canvas || !this.loaded) throw new Error('流程圖還沒載入');
    const base = this.loaded;
    const exp = this.canvas.exportGraph();
    const nodes = new Map<string, CanonicalNode>();
    for (const n of base.nodes)
      nodes.set(n.id, structuredClone(this.working.get(n.id) ?? n));
    for (const nn of exp.newNodes)
      if (!nodes.has(nn.guid))
        nodes.set(
          nn.guid,
          structuredClone(
            this.working.get(nn.guid) ??
              this.newNode(nn.guid, nn.typeName, nn.x, nn.y)
          )
        );
    for (const g of exp.deletedNodeGuids) nodes.delete(g);
    const lite = new Map<string, LiteNode>();
    for (const [node, guid] of this.canvas._debug.guidByNode())
      lite.set(guid, node);
    for (const p of exp.nodePositions) {
      const n = nodes.get(p.guid);
      if (!n) continue;
      if (this.lockedBy.has(p.guid)) {
        // Someone else controls it: whatever happened here doesn't count; put it back.
        const ln = lite.get(p.guid);
        if (ln) {
          ln.pos[0] = n.position.x;
          ln.pos[1] = n.position.y;
        }
        continue;
      }
      n.position.x = p.x;
      n.position.y = p.y;
    }
    const portKey = (e: {
      fromNodeGuid: string;
      fromPort: string;
      toNodeGuid: string;
      toPort: string;
    }) => `${e.fromNodeGuid}.${e.fromPort}->${e.toNodeGuid}.${e.toPort}`;
    const exported = new Set(exp.edges.map(portKey));
    const edges: CanonicalEdge[] = base.edges.filter(
      e =>
        exported.has(`${e.fromNode}.${e.fromPort}->${e.toNode}.${e.toPort}`) &&
        nodes.has(e.fromNode) &&
        nodes.has(e.toNode)
    );
    const kept = new Set(
      edges.map(e => `${e.fromNode}.${e.fromPort}->${e.toNode}.${e.toPort}`)
    );
    for (const e of exp.edges)
      if (!kept.has(portKey(e))) {
        edges.push({
          fromNode: e.fromNodeGuid,
          fromPort: e.fromPort,
          toNode: e.toNodeGuid,
          toPort: e.toPort,
        });
        kept.add(portKey(e));
      }
    const baseGroups = new Map(base.groups.map(g => [g.id, g]));
    const groups: CanonicalGroup[] = [];
    for (const eg of exp.groups) {
      if (!eg.clientId) continue;
      const bg = baseGroups.get(eg.clientId);
      const g: CanonicalGroup = bg
        ? structuredClone(bg)
        : {
            id: eg.clientId,
            title: '',
            color: { r: 0, g: 0, b: 0, a: 0.3 },
            position: { x: eg.x, y: eg.y, width: eg.width, height: eg.height },
            nodes: [],
          };
      g.title = eg.title ?? '';
      if (eg.color && eg.color.toLowerCase() !== toHex(g.color).toLowerCase()) {
        const c = parseHex(eg.color);
        if (c) g.color = { ...g.color, ...c };
      }
      g.nodes = [...eg.memberNodeGuids];
      const shown = this.shownGroupBounds.get(eg.clientId);
      const same =
        shown &&
        Math.abs(shown.x - eg.x) < 0.01 &&
        Math.abs(shown.y - eg.y) < 0.01 &&
        Math.abs(shown.width - eg.width) < 0.01 &&
        Math.abs(shown.height - eg.height) < 0.01;
      if (!same)
        g.position = {
          ...g.position,
          x: eg.x,
          y: eg.y,
          width: eg.width,
          height: eg.height,
        };
      groups.push(g);
    }
    const edited: CanonicalGraph = {
      ...base,
      nodes: [...nodes.values()],
      edges,
      groups,
    };

    let stats = { nodes: 0, edges: 0, groups: 0, stickyNotes: 0, memos: 0 };
    this.doc.transact(() => {
      stats = sfFlow.writeGraph(this.doc, edited, base);
    }, FLOW_LOCAL);
    const tables = this.syncTables(base, edited);

    this.canvas.markSaveSucceeded();
    // The new base is what this canvas shows (not the doc: it may hold others' changes the canvas has not
    // taken in yet, which must not be "reverted" by the next save).
    this.loaded = edited;
    this.working = new Map(
      this.loaded.nodes.map(n => [n.id, structuredClone(n)])
    );
    this.dirtyFields = false;
    return {
      nodes: stats.nodes,
      edges: stats.edges,
      groups: stats.groups,
      tables,
    };
  }

  // 劇本 nodes and their tables: a new 劇本 node gets an (empty) table and an index entry; a rename updates
  // the index; a deleted one is marked orphan (its table stays, so restoring the node finds it again).
  private syncTables(base: CanonicalGraph, edited: CanonicalGraph) {
    const before = new Map(
      base.nodes
        .filter(n => n.type === PLAYSCRIPT_TYPE)
        .map(n => [n.id, identityOf(n)])
    );
    const after = new Map(
      edited.nodes
        .filter(n => n.type === PLAYSCRIPT_TYPE)
        .map(n => [n.id, identityOf(n)])
    );
    let created = 0;
    this.projectDoc.transact(() => {
      sfTables.ensureProject(this.projectDoc);
      for (const [guid, name] of after) {
        // Only nodes added or renamed in this save; untouched nodes keep whatever table they have.
        if (!name || before.get(guid) === name) continue;
        const chapter = name.includes('/')
          ? name.slice(0, name.indexOf('/'))
          : '_其他';
        sfTables.upsertIndex(this.projectDoc, {
          guid,
          name,
          chapter,
          orphan: false,
        });
        const t = this.tableDoc(guid);
        if (!before.has(guid) || !t.getMap('meta').size) {
          t.transact(
            () => sfTables.initPlayscriptMeta(t, guid, name),
            FLOW_LOCAL
          );
          created++;
        } else if (t.getMap('meta').get('name') !== name) {
          t.transact(
            () => sfTables.initPlayscriptMeta(t, guid, name),
            FLOW_LOCAL
          );
        }
      }
      const index = new Map(
        sfTables.readProject(this.projectDoc).playscripts.map(p => [p.guid, p])
      );
      for (const [guid] of before) {
        const entry = index.get(guid);
        if (!after.has(guid) && entry)
          sfTables.upsertIndex(this.projectDoc, { ...entry, orphan: true });
      }
    }, FLOW_LOCAL);
    void this.workspaceId;
    return created;
  }
}
