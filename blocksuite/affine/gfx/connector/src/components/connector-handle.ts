import {
  EdgelessLegacySlotIdentifier,
  OverlayIdentifier,
} from '@blocksuite/affine-block-surface';
import {
  type ConnectorCurveAnchor,
  type ConnectorElementModel,
  ConnectorMode,
  pointToConnectorFrame,
  vecToConnectorFrame,
} from '@blocksuite/affine-model';
import { DisposableGroup } from '@blocksuite/global/disposable';
import {
  getBezierParameters,
  getBezierPoint,
  getBezierTangent,
  type IVec,
  Vec,
} from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import {
  type BlockComponent,
  type BlockStdScope,
  stdContext,
  storeContext,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import type { Store } from '@blocksuite/store';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing, svg } from 'lit';
import { property, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { ConnectionOverlay } from '../connector-manager';

const SIZE = 12;
const HALF_SIZE = SIZE / 2;
// NineDay: anchors, Bezier handles and "+" points of a curve.
const ANCHOR_SIZE = 10;
const HANDLE_SIZE = 8;
const GHOST_SIZE = 10;

/**
 * NineDay: what a drag on the curve edits: an anchor (by its index in
 * `curveAnchors`), one of its handles, or the handle of an end.
 */
type CurveDrag =
  | { type: 'anchor'; index: number }
  | { type: 'handle'; index: number; side: 'in' | 'out' }
  | { type: 'start-handle' }
  | { type: 'end-handle' };

export class EdgelessConnectorHandle extends WithDisposable(LitElement) {
  static override styles = css`
    .line-controller {
      position: absolute;
      width: ${SIZE}px;
      height: ${SIZE}px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 2px solid var(--affine-text-emphasis-color);
      background-color: var(--affine-background-primary-color);
      cursor: pointer;
      z-index: 10;
      pointer-events: all;
      /**
       * Fix: pointerEvent stops firing after a short time.
       * When a gesture is started, the browser intersects the touch-action values of the touched element and its ancestors,
       * up to the one that implements the gesture (in other words, the first containing scrolling element)
       * https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
       */
      touch-action: none;
    }
    .line-controller-hidden {
      display: none;
    }
    .curve-lines {
      position: absolute;
      left: 0;
      top: 0;
      width: 1px;
      height: 1px;
      overflow: visible;
      pointer-events: none;
    }
    .curve-lines line {
      stroke: var(--affine-text-emphasis-color);
      stroke-width: 1px;
    }
    .curve-anchor,
    .curve-handle,
    .curve-ghost {
      position: absolute;
      left: 0;
      top: 0;
      box-sizing: border-box;
      pointer-events: all;
      touch-action: none;
      z-index: 10;
    }
    .curve-anchor {
      width: ${ANCHOR_SIZE}px;
      height: ${ANCHOR_SIZE}px;
      border: 2px solid var(--affine-text-emphasis-color);
      background-color: var(--affine-text-emphasis-color);
      border-radius: 2px;
      cursor: move;
    }
    .curve-handle {
      width: ${HANDLE_SIZE}px;
      height: ${HANDLE_SIZE}px;
      border: 1.5px solid var(--affine-text-emphasis-color);
      background-color: var(--affine-background-primary-color);
      border-radius: 50%;
      cursor: pointer;
    }
    .curve-ghost {
      width: ${GHOST_SIZE}px;
      height: ${GHOST_SIZE}px;
      border: 1.5px solid var(--affine-text-emphasis-color);
      background-color: var(--affine-background-primary-color);
      border-radius: 50%;
      opacity: 0.5;
      cursor: copy;
    }
    .curve-ghost:hover {
      opacity: 1;
    }
  `;

  private _lastZoom = 1;

  get connectionOverlay() {
    return this.std.get(OverlayIdentifier('connection')) as ConnectionOverlay;
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get slots() {
    return this.std.get(EdgelessLegacySlotIdentifier);
  }

  private _bindEvent() {
    const slots = this.slots;

    this._disposables.addFromEvent(this._startHandler, 'pointerdown', e => {
      slots.elementResizeStart.next();
      this._capPointerDown(e, 'source');
    });
    this._disposables.addFromEvent(this._endHandler, 'pointerdown', e => {
      slots.elementResizeStart.next();
      this._capPointerDown(e, 'target');
    });
    this._disposables.add(() => {
      this.connectionOverlay.clear();
    });
  }

  private _capPointerDown(e: PointerEvent, connection: 'target' | 'source') {
    const { gfx, connector, slots, _disposables } = this;
    e.stopPropagation();
    _disposables.addFromEvent(document, 'pointermove', e => {
      const point = gfx.viewport.toModelCoordFromClientCoord([e.x, e.y]);
      const isStartPointer = connection === 'source';
      const otherSideId = connector[isStartPointer ? 'target' : 'source'].id;

      connector[connection] = this.connectionOverlay.renderConnector(
        point,
        otherSideId ? [otherSideId] : []
      );
      this.requestUpdate();
    });

    _disposables.addFromEvent(document, 'pointerup', () => {
      this.doc.captureSync();
      _disposables.dispose();
      this._disposables = new DisposableGroup();
      this._bindEvent();
      slots.elementResizeEnd.next();
    });
  }

  /** NineDay: start and end of the curve, the frame its anchors are stored in. */
  private _curveEnds() {
    const path = this.connector.absolutePath;
    return { start: path[0], end: path[path.length - 1] };
  }

  private _anchors() {
    return [...(this.connector.curveAnchors ?? [])];
  }

  /** NineDay: drag an anchor or a handle of the curve. */
  private _startCurveDrag(
    e: PointerEvent,
    drag: CurveDrag,
    // false when the drag continues a change already started (a new anchor).
    newUndoStep = true
  ) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const { gfx, slots, doc } = this;
    const disposables = new DisposableGroup();
    slots.elementResizeStart.next();
    if (newUndoStep) doc.captureSync();

    disposables.addFromEvent(document, 'pointermove', (e: PointerEvent) => {
      const point = gfx.viewport.toModelCoordFromClientCoord([e.x, e.y]);
      this._applyCurveDrag(drag, point, e.altKey);
      this.requestUpdate();
    });
    disposables.addFromEvent(document, 'pointerup', () => {
      doc.captureSync();
      disposables.dispose();
      slots.elementResizeEnd.next();
    });
    this._disposables.add(disposables);
  }

  private _applyCurveDrag(drag: CurveDrag, point: IVec, breakHandles: boolean) {
    const { connector } = this;
    const { start, end } = this._curveEnds();
    const path = connector.absolutePath;

    switch (drag.type) {
      case 'start-handle': {
        connector.curveStartOut = vecToConnectorFrame(
          start,
          end,
          Vec.sub(point, start)
        );
        return;
      }
      case 'end-handle': {
        connector.curveEndIn = vecToConnectorFrame(
          start,
          end,
          Vec.sub(point, end)
        );
        return;
      }
      case 'anchor': {
        const anchors = this._anchors();
        const anchor = anchors[drag.index];
        if (!anchor) return;
        anchors[drag.index] = {
          ...anchor,
          position: pointToConnectorFrame(start, end, point),
        };
        connector.curveAnchors = anchors;
        return;
      }
      case 'handle': {
        const anchors = this._anchors();
        const anchor = anchors[drag.index];
        const anchorPoint = path[drag.index + 1];
        if (!anchor || !anchorPoint) return;

        const moved = Vec.sub(point, anchorPoint);
        const other = drag.side === 'in' ? 'out' : 'in';
        const next: ConnectorCurveAnchor = {
          ...anchor,
          [drag.side]: vecToConnectorFrame(start, end, moved),
        };
        // A smooth anchor: the other handle turns with this one and keeps its
        // length. Alt breaks the pair.
        if (!breakHandles && Vec.len(moved) > 0) {
          const otherVec = other === 'in' ? anchorPoint.in : anchorPoint.out;
          const length = Vec.len(otherVec);
          next[other] = vecToConnectorFrame(
            start,
            end,
            Vec.mul(Vec.normalize(Vec.mul(moved, -1)), length)
          );
        }
        anchors[drag.index] = next;
        connector.curveAnchors = anchors;
        return;
      }
    }
  }

  /** NineDay: a "+" point adds an anchor in the middle of its segment. */
  private _addAnchor(e: PointerEvent, segment: number) {
    if (e.button !== 0) return;
    const { connector } = this;
    const { start, end } = this._curveEnds();
    const path = connector.absolutePath;
    const params = getBezierParameters([path[segment], path[segment + 1]]);
    const middle = getBezierPoint(params, 0.5);
    const tangent = getBezierTangent(params, 0.5);
    if (!middle || !tangent) return;

    const length = Vec.dist(path[segment], path[segment + 1]) / 4;
    const out = Vec.mul(tangent, length);
    const anchors = this._anchors();
    this.doc.captureSync();
    anchors.splice(segment, 0, {
      position: pointToConnectorFrame(start, end, middle),
      in: vecToConnectorFrame(start, end, Vec.mul(out, -1)),
      out: vecToConnectorFrame(start, end, out),
    });
    connector.curveAnchors = anchors;
    // Adding and placing the anchor is one undo step.
    this._startCurveDrag(e, { type: 'anchor', index: segment }, false);
  }

  /** NineDay: double click on an anchor removes it. */
  private _removeAnchor(e: MouseEvent, index: number) {
    e.stopPropagation();
    e.preventDefault();
    const anchors = this._anchors();
    anchors.splice(index, 1);
    this.doc.captureSync();
    this.connector.curveAnchors = anchors.length ? anchors : undefined;
    this.doc.captureSync();
  }

  override firstUpdated() {
    const { gfx } = this;
    const { viewport } = gfx;

    this._lastZoom = viewport.zoom;
    viewport.viewportUpdated.subscribe(() => {
      if (viewport.zoom !== this._lastZoom) {
        this._lastZoom = viewport.zoom;
        this.requestUpdate();
      }
    });

    this._bindEvent();

    // NineDay: the path also changes when a connected element moves, or on
    // undo; follow it (`_disposables` is replaced after every drag).
    const subscription = gfx.surface?.elementUpdated.subscribe(({ id }) => {
      if (id === this.connector.id) this.requestUpdate();
    });
    if (subscription) this._pathSubscription = subscription;
  }

  private _pathSubscription: { unsubscribe: () => void } | null = null;

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._pathSubscription?.unsubscribe();
    this._pathSubscription = null;
  }

  private _renderCurve() {
    const { connector, gfx } = this;
    // path is relative to the element's xywh
    const { path } = connector;
    if (connector.mode !== ConnectorMode.Curve || path.length < 2) {
      return nothing;
    }
    const zoom = gfx.viewport.zoom;
    const toView = (p: IVec) => Vec.mul(p, zoom);
    const place = (p: IVec, size: number) => {
      const [x, y] = Vec.subScalar(toView(p), size / 2);
      return styleMap({ transform: `translate3d(${x}px,${y}px,0)` });
    };

    const last = path.length - 1;
    const lines: [IVec, IVec][] = [];
    const handles: { at: IVec; drag: CurveDrag }[] = [];

    if (!Vec.isEqual(path[0].out, [0, 0])) {
      lines.push([path[0], path[0].absOut]);
      handles.push({ at: path[0].absOut, drag: { type: 'start-handle' } });
    }
    if (!Vec.isEqual(path[last].in, [0, 0])) {
      lines.push([path[last], path[last].absIn]);
      handles.push({ at: path[last].absIn, drag: { type: 'end-handle' } });
    }
    for (let i = 1; i < last; i++) {
      lines.push([path[i].absIn, path[i].absOut]);
      handles.push(
        {
          at: path[i].absIn,
          drag: { type: 'handle', index: i - 1, side: 'in' },
        },
        {
          at: path[i].absOut,
          drag: { type: 'handle', index: i - 1, side: 'out' },
        }
      );
    }

    const ghosts: IVec[] = [];
    for (let i = 0; i < last; i++) {
      const p = getBezierPoint(
        getBezierParameters([path[i], path[i + 1]]),
        0.5
      );
      if (p) ghosts.push(p);
    }

    return html`
      <svg class="curve-lines">
        ${lines.map(([a, b]) => {
          const [x1, y1] = toView(a);
          const [x2, y2] = toView(b);
          return svg`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2}></line>`;
        })}
      </svg>
      ${repeat(
        ghosts,
        (_, i) => `ghost-${i}`,
        (p, i) =>
          html`<div
            class="curve-ghost"
            style=${place(p, GHOST_SIZE)}
            @pointerdown=${(e: PointerEvent) => this._addAnchor(e, i)}
          ></div>`
      )}
      ${repeat(
        path.slice(1, last),
        (_, i) => `anchor-${i}`,
        (p, i) =>
          html`<div
            class="curve-anchor"
            style=${place(p, ANCHOR_SIZE)}
            @pointerdown=${(e: PointerEvent) =>
              this._startCurveDrag(e, { type: 'anchor', index: i })}
            @dblclick=${(e: MouseEvent) => this._removeAnchor(e, i)}
          ></div>`
      )}
      ${handles.map(
        ({ at, drag }) =>
          html`<div
            class="curve-handle"
            style=${place(at, HANDLE_SIZE)}
            @pointerdown=${(e: PointerEvent) => this._startCurveDrag(e, drag)}
          ></div>`
      )}
    `;
  }

  override render() {
    const { gfx } = this;
    // path is relative to the element's xywh
    const { path } = this.connector;
    const zoom = gfx.viewport.zoom;
    const startPoint = Vec.subScalar(Vec.mul(path[0], zoom), HALF_SIZE);
    const endPoint = Vec.subScalar(
      Vec.mul(path[path.length - 1], zoom),
      HALF_SIZE
    );
    const startStyle = {
      transform: `translate3d(${startPoint[0]}px,${startPoint[1]}px,0)`,
    };
    const endStyle = {
      transform: `translate3d(${endPoint[0]}px,${endPoint[1]}px,0)`,
    };
    return html`
      ${this._renderCurve()}
      <div
        class="line-controller line-start"
        style=${styleMap(startStyle)}
      ></div>
      <div class="line-controller line-end" style=${styleMap(endStyle)}></div>
    `;
  }

  @query('.line-end')
  private accessor _endHandler!: HTMLDivElement;

  @query('.line-start')
  private accessor _startHandler!: HTMLDivElement;

  @property({ attribute: false })
  accessor connector!: ConnectorElementModel;

  @consume({
    context: storeContext,
  })
  accessor doc!: Store;

  @property({ attribute: false })
  accessor edgeless!: BlockComponent;

  @consume({
    context: stdContext,
  })
  accessor std!: BlockStdScope;
}
