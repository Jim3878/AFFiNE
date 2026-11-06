// NineDay StoryForge: the project's flow graph (db$sf.flowgraph.main), edited in the browser with the same
// canvas local StoryForge uses. First version: explicit 存檔 (changes are merged per field with what others
// saved meanwhile); when someone else saves, the canvas reloads by itself unless you have unsaved edits.
import { Header } from '@affine/core/components/pure/header';
import { AuthService } from '@affine/core/modules/cloud';
import {
  getSfAwareness,
  getSfDoc,
  sfSchema,
  useYDocVersion,
} from '@affine/core/modules/storyforge/docs';
import {
  FLOW_LOCAL,
  FlowGraphEditor,
  type SelectedGroup,
  type SelectedNode,
} from '@affine/core/modules/storyforge/flowgraph-editor';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';

import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '../../../../modules/workbench';
import * as styles from './storyforge.css';

const CANVAS_ID = 'sf-flow-canvas';
const COLORS = [
  '#f08a24',
  '#2a9df4',
  '#8e44ad',
  '#2fa05a',
  '#d6336c',
  '#0ca5a5',
  '#b8860b',
  '#5b5ce0',
];
function colorFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

function MemoEditor({ text }: { text: Y.Text }) {
  const [value, setValue] = useState(text.toString());
  useEffect(() => {
    setValue(text.toString());
    const update = () => setValue(text.toString());
    text.observe(update);
    return () => text.unobserve(update);
  }, [text]);
  return (
    <textarea
      className={styles.flowMemo}
      value={value}
      onChange={e => {
        const next = e.target.value;
        setValue(next);
        const doc = text.doc;
        const apply = () => {
          const cur = text.toString();
          let a = 0;
          while (a < cur.length && a < next.length && cur[a] === next[a]) a++;
          let b1 = cur.length;
          let b2 = next.length;
          while (b1 > a && b2 > a && cur[b1 - 1] === next[b2 - 1]) {
            b1--;
            b2--;
          }
          if (b1 > a) text.delete(a, b1 - a);
          if (b2 > a) text.insert(a, next.slice(a, b2));
        };
        if (doc) doc.transact(apply, FLOW_LOCAL);
        else apply();
      }}
    />
  );
}

export const FlowGraphPage = () => {
  const workspace = useService(WorkspaceService).workspace;
  const workbench = useService(WorkbenchService).workbench;
  const account = useLiveData(useService(AuthService).session.account$);
  const flowDoc = useMemo(
    () => getSfDoc(workspace, 'sf.flowgraph.main'),
    [workspace]
  );
  const rulesDoc = useMemo(() => getSfDoc(workspace, 'sf.rules'), [workspace]);
  const projectDoc = useMemo(
    () => getSfDoc(workspace, 'sf.project'),
    [workspace]
  );
  const flowVersion = useYDocVersion(flowDoc);
  const rulesVersion = useYDocVersion(rulesDoc);
  const editor = useMemo(
    () =>
      new FlowGraphEditor(
        flowDoc,
        workspace.id,
        guid => getSfDoc(workspace, `sf.playscript.${guid}`),
        projectDoc
      ),
    [flowDoc, projectDoc, workspace]
  );
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState('');
  const [node, setNode] = useState<SelectedNode | null>(null);
  const [group, setGroup] = useState<SelectedGroup | null>(null);
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const hasGraph = flowDoc.getMap('nodes').size > 0;
  // rulesVersion: re-read whenever the rules doc changes (the doc object itself stays the same).
  const nodeSchema = useMemo(
    () => sfSchema.readNodeSchema(rulesDoc),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rulesDoc, rulesVersion]
  );

  useEffect(() => {
    editor.onSelectNode = setNode;
    editor.onSelectGroup = setGroup;
    editor.onMessage = setMessage;
    editor.onOpenTable = guid => workbench.open(`/storyforge/${guid}`);
  }, [editor, workbench]);

  // Mount once the graph and the node schema have arrived from the server.
  useEffect(() => {
    if (mounted || !hasGraph || !nodeSchema) return;
    editor.setSchema(nodeSchema);
    let cancelled = false;
    editor
      .mount(CANVAS_ID)
      .then(() => {
        if (!cancelled) setMounted(true);
      })
      .catch(e =>
        setMessage(
          `畫布載入失敗：${e instanceof Error ? e.message : String(e)}`
        )
      );
    return () => {
      cancelled = true;
    };
  }, [editor, hasGraph, nodeSchema, mounted, flowVersion]);

  // Live editing: every second, save what changed here (merged per field), then take in what others
  // saved — moved nodes move in place, anything structural rebuilds the canvas. Never mid-gesture.
  const remotePending = useRef(false);
  useEffect(() => {
    if (!mounted) return;
    const graphTypes: Y.AbstractType<any>[] = [
      'nodes',
      'edges',
      'groups',
      'meta',
    ].map(k => flowDoc.getMap(k));
    const onTx = (tr: Y.Transaction) => {
      if (tr.origin === FLOW_LOCAL) return;
      if (
        [...tr.changedParentTypes.keys()].some(t =>
          graphTypes.some(g => isInside(t, g))
        )
      )
        remotePending.current = true;
    };
    flowDoc.on('afterTransaction', onTx);
    const timer = setInterval(() => {
      if (editor.isBusy()) return;
      try {
        if (editor.hasUnsavedChanges()) {
          const r = editor.save();
          setMessage(
            `已自動儲存 ${new Date().toLocaleTimeString()}${r.tables ? `（建立 ${r.tables} 份劇本表格）` : ''}`
          );
        }
        if (remotePending.current) {
          remotePending.current = false;
          if (editor.takeRemote() === 'structural') editor.reload(CANVAS_ID);
        }
      } catch (e) {
        setMessage(`儲存失敗：${e instanceof Error ? e.message : String(e)}`);
      }
    }, 1000);
    return () => {
      flowDoc.off('afterTransaction', onTx);
      clearInterval(timer);
    };
  }, [editor, flowDoc, mounted]);

  // Presence: my cursor (graph coordinates) and selected node; everyone else's drawn on the canvas.
  const awareness = useMemo(
    () => getSfAwareness(workspace, 'sf.flowgraph.main'),
    [workspace]
  );
  const [peers, setPeers] = useState<
    { id: number; name: string; color: string }[]
  >([]);
  useEffect(() => {
    const id = account?.id ?? 'anonymous';
    awareness.setLocalStateField('user', {
      name: account?.label ?? '訪客',
      color: colorFor(id),
    });
  }, [awareness, account]);
  useEffect(() => {
    awareness.setLocalStateField('flowSelected', node?.guid ?? null);
  }, [awareness, node]);
  useEffect(() => {
    const update = () => {
      const list: {
        id: number;
        name: string;
        color: string;
        cursor?: { x: number; y: number } | null;
        selected?: string | null;
      }[] = [];
      awareness.getStates().forEach((st, cid) => {
        if (cid === awareness.clientID || !st?.user) return;
        list.push({
          id: cid,
          name: st.user.name,
          color: st.user.color,
          cursor: st.flowCursor ?? null,
          selected: st.flowSelected ?? null,
        });
      });
      editor.setPeers(list);
      setPeers(list.map(p => ({ id: p.id, name: p.name, color: p.color })));
    };
    update();
    awareness.on('change', update);
    return () => {
      awareness.off('change', update);
      awareness.setLocalStateField('flowCursor', null);
      awareness.setLocalStateField('flowSelected', null);
    };
  }, [awareness, editor]);
  useEffect(() => {
    const el = box.current;
    if (!el || !mounted) return;
    let last = 0;
    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - last < 66) return; // ~15 Hz
      last = now;
      awareness.setLocalStateField('flowCursor', editor.graphPoint(e));
    };
    const onLeave = () => awareness.setLocalStateField('flowCursor', null);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [awareness, editor, mounted]);

  const save = useCallback(() => {
    try {
      const r = editor.save();
      setMessage(
        `已儲存：${r.nodes} 個節點、${r.edges} 條連線、${r.groups} 個群組有變動${r.tables ? `，建立 ${r.tables} 份劇本表格` : ''}。`
      );
    } catch (e) {
      setMessage(`儲存失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [editor]);

  // Ctrl+S saves, like local StoryForge.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 's' &&
        box.current?.isConnected
      ) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  // Warn before leaving with unsaved canvas edits.
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (mounted && editor.hasUnsavedChanges()) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [editor, mounted]);

  const memo = useMemo(
    () =>
      node && node.type === 'playscript' ? editor.memoText(node.guid) : null,
    [editor, node]
  );

  return (
    <>
      <ViewTitle title="StoryForge 流程圖" />
      <ViewIcon icon="edgeless" />
      <ViewHeader>
        <Header
          left={<div className={styles.header}>StoryForge 流程圖</div>}
          right={
            <div className={styles.avatars}>
              {peers.map(p => (
                <div
                  key={p.id}
                  className={styles.avatar}
                  style={{ background: p.color }}
                  title={p.name}
                >
                  {p.name.slice(0, 1)}
                </div>
              ))}
            </div>
          }
        />
      </ViewHeader>
      <ViewBody>
        <div className={styles.flowPage}>
          <div
            className={styles.toolbar}
            style={{ padding: '8px 12px', margin: 0 }}
          >
            <button
              className={styles.flowButton}
              onClick={save}
              disabled={!mounted}
            >
              💾 立即儲存（Ctrl+S）
            </button>
            <button
              className={styles.iconButton}
              disabled={!mounted}
              onClick={() => {
                if (
                  editor.hasUnsavedChanges() &&
                  !confirm('還有幾秒內的修改沒存，重新載入會丟掉它們。確定？')
                )
                  return;
                editor.reload(CANVAS_ID);
              }}
            >
              ⟳ 重新載入
            </button>
            <button
              className={styles.iconButton}
              disabled={!mounted}
              onClick={() => editor.fitView()}
            >
              ⤢ 縮放至全部
            </button>
            <input
              className={styles.search}
              placeholder="搜尋劇本／旗標…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') editor.search(query);
              }}
            />
            <span className={styles.muted}>{message}</span>
          </div>
          <div className={styles.flowMain}>
            <div ref={box} className={styles.flowCanvasBox}>
              {!hasGraph && (
                <div className={styles.empty}>
                  雲端還沒有流程圖（或還在載入）。請在本機
                  StoryForge「雲端同步」分頁按「上傳流程圖」。
                </div>
              )}
              {hasGraph && !nodeSchema && (
                <div className={styles.empty}>
                  還沒有節點 schema。請在本機 StoryForge 重新「上傳流程圖」。
                </div>
              )}
              <canvas
                id={CANVAS_ID}
                className={styles.flowCanvas}
                style={{ display: hasGraph && nodeSchema ? 'block' : 'none' }}
              />
            </div>
            <div className={styles.flowSide}>
              {node ? (
                <>
                  <div className={styles.chapter} style={{ marginTop: 0 }}>
                    {node.typeLabel}
                  </div>
                  {node.fields.map(f => (
                    <label key={f.name} className={styles.flowField}>
                      <span>{f.name}</span>
                      <input
                        key={`${node.guid}:${f.name}`}
                        defaultValue={f.value}
                        onBlur={e => {
                          const stored = editor.setField(
                            node.guid,
                            f.name,
                            e.target.value
                          );
                          e.target.value = stored;
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter')
                            (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </label>
                  ))}
                  {memo && (
                    <label className={styles.flowField}>
                      <span>Memo（即時同步）</span>
                      <MemoEditor text={memo} />
                    </label>
                  )}
                  {node.type === 'playscript' && (
                    <button
                      className={styles.flowButton}
                      onClick={() => workbench.open(`/storyforge/${node.guid}`)}
                    >
                      ▤ 開啟劇本表格
                    </button>
                  )}
                  <div className={styles.muted} style={{ marginTop: 8 }}>
                    改動每秒自動儲存並和別人的合併；Memo 打字就會同步。
                  </div>
                </>
              ) : group ? (
                <>
                  <div className={styles.chapter} style={{ marginTop: 0 }}>
                    群組
                  </div>
                  <label className={styles.flowField}>
                    <span>標題</span>
                    <input
                      key={`${group.clientId}:t`}
                      defaultValue={group.title}
                      onBlur={e =>
                        editor.setGroup(
                          group.clientId,
                          e.target.value,
                          group.color
                        )
                      }
                    />
                  </label>
                  <label className={styles.flowField}>
                    <span>顏色</span>
                    <input
                      key={`${group.clientId}:c`}
                      type="color"
                      defaultValue={
                        group.color.length === 7 ? group.color : '#335577'
                      }
                      onChange={e =>
                        editor.setGroup(
                          group.clientId,
                          group.title,
                          e.target.value
                        )
                      }
                    />
                  </label>
                </>
              ) : (
                <div className={styles.muted}>
                  點節點看欄位和
                  Memo。右鍵或從接點拖出線可以新增節點；新增並命名的「劇本」節點會自動建立劇本表格。
                </div>
              )}
            </div>
          </div>
        </div>
      </ViewBody>
    </>
  );
};

function isInside(type: Y.AbstractType<any>, root: Y.AbstractType<any>) {
  let t: Y.AbstractType<any> | null = type;
  while (t) {
    if (t === root) return true;
    t = (t._item?.parent as Y.AbstractType<any> | undefined) ?? null;
  }
  return false;
}

export const Component = () => <FlowGraphPage />;
