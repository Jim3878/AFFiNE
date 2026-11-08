// NineDay StoryForge: one playscript table (db$sf.playscript.<guid>), co-edited live.
// Fixed 7 columns, one Y.Text per cell; others' focused cells show in their colour via awareness.
// Closed-list checks (名字 / 表情 / 功能) come from the rules JSON local StoryForge uploads.
import { Header } from '@affine/core/components/pure/header';
import { AuthService } from '@affine/core/modules/cloud';
import {
  getSfAwareness,
  sfSchema,
  usePlayscriptDoc,
  usePresenceUser,
  useSfProject,
  useSfRules,
} from '@affine/core/modules/storyforge/docs';
import { WorkspaceService } from '@affine/core/modules/workspace';
import {
  checkRows,
  COLUMN_KEYS,
  type ColumnKey,
  COLUMNS,
  type RowIssue,
} from '@nineday/storyforge-cloud/layout';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as Y from 'yjs';

import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
  WorkbenchLink,
} from '../../../../modules/workbench';
import * as styles from './storyforge.css';

const LOCAL = 'sf-local';
const WIDTHS: Record<ColumnKey, string> = {
  name: '9%',
  face: '9%',
  voice: '9%',
  text: '33%',
  func: '10%',
  note: '15%',
  param: '15%',
};
const SINGLE_LINE = new Set<ColumnKey>(['name', 'face', 'voice', 'func']);

type Cursor = { rowId: string; col: ColumnKey };
type Peer = {
  clientId: number;
  name: string;
  color: string;
  cursor: Cursor | null;
};

function cellText(doc: Y.Doc, rowId: string, col: ColumnKey): Y.Text {
  const row = doc.getMap<Y.Map<Y.Text>>('rows').get(rowId);
  const existing = row?.get(col);
  if (existing instanceof Y.Text) return existing;
  const t = new Y.Text();
  if (row) doc.transact(() => row.set(col, t), LOCAL);
  return t;
}

// ---------- one editable cell ----------

type Delta = { insert?: string | object; retain?: number; delete?: number };

function shift(pos: number, deltas: Delta[][]) {
  for (const delta of deltas) {
    let index = 0;
    for (const d of delta) {
      if (d.retain) index += d.retain;
      else if (d.insert !== undefined) {
        const n = typeof d.insert === 'string' ? d.insert.length : 1;
        if (index <= pos) pos += n;
        index += n;
      } else if (d.delete && index < pos) {
        pos -= Math.min(d.delete, pos - index);
      }
    }
  }
  return pos;
}

function CellEditor({
  doc,
  ytext,
  multiline,
  listId,
  onClose,
}: {
  doc: Y.Doc;
  ytext: Y.Text;
  multiline: boolean;
  listId?: string;
  onClose: (move?: 'down' | 'next' | 'prev') => void;
}) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const synced = useRef(ytext.toString());
  const pending = useRef<Delta[][]>([]);
  const composing = useRef(false);

  const autosize = useCallback(() => {
    const el = ref.current;
    if (!el || !multiline) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [multiline]);

  // Local edit = diff of what the field showed (synced) against its value now, moved past any remote
  // edits that arrived meanwhile (only while an IME composition was open), applied to the Y.Text.
  const commit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const before = synced.current;
    const after = el.value;
    if (before === after && pending.current.length === 0) return;
    let start = 0;
    while (
      start < before.length &&
      start < after.length &&
      before[start] === after[start]
    )
      start++;
    let eb = before.length;
    let ea = after.length;
    while (eb > start && ea > start && before[eb - 1] === after[ea - 1]) {
      eb--;
      ea--;
    }
    const hadRemote = pending.current.length > 0;
    const from = shift(start, pending.current);
    const to = Math.max(from, shift(eb, pending.current));
    const insert = after.slice(start, ea);
    doc.transact(() => {
      if (to > from) ytext.delete(from, Math.min(to, ytext.length) - from);
      if (insert) ytext.insert(from, insert);
    }, LOCAL);
    pending.current = [];
    synced.current = ytext.toString();
    if (hadRemote || el.value !== synced.current) {
      el.value = synced.current;
      const caret = from + insert.length;
      el.setSelectionRange(caret, caret);
    }
    autosize();
  }, [doc, ytext, autosize]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = synced.current = ytext.toString();
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    autosize();
    const onRemote = (event: Y.YTextEvent, tr: Y.Transaction) => {
      if (tr.origin === LOCAL) return;
      const delta = event.delta as Delta[];
      if (composing.current) {
        pending.current.push(delta);
        return;
      }
      const s = shift(el.selectionStart ?? 0, [delta]);
      const e = shift(el.selectionEnd ?? 0, [delta]);
      el.value = synced.current = ytext.toString();
      el.setSelectionRange(s, e);
      autosize();
    };
    ytext.observe(onRemote);
    return () => ytext.unobserve(onRemote);
  }, [ytext, autosize]);

  const common = {
    ref,
    className: styles.cellEditor,
    onInput: () => {
      if (!composing.current) commit();
      autosize();
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: () => {
      composing.current = false;
      commit();
    },
    onBlur: () => {
      commit();
      onClose();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (composing.current || e.nativeEvent.isComposing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
        e.preventDefault();
        commit();
        onClose('down');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commit();
        onClose(e.shiftKey ? 'prev' : 'next');
      }
    },
  };
  return multiline ? (
    <textarea rows={1} {...common} />
  ) : (
    <input list={listId} {...common} />
  );
}

// ---------- page ----------

export const PlayscriptPage = () => {
  const { guid = '' } = useParams();
  const workspace = useService(WorkspaceService).workspace;
  const account = useLiveData(useService(AuthService).session.account$);
  const project = useSfProject(workspace);
  const rules = useSfRules(workspace);
  const { doc, rows } = usePlayscriptDoc(workspace, guid);
  const awareness = useMemo(
    () => getSfAwareness(workspace, `sf.playscript.${guid}`),
    [workspace, guid]
  );
  const [editing, setEditing] = useState<Cursor | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const entry = project.playscripts.find(p => p.guid === guid);
  const name = entry?.name ?? guid;

  // Created in the effect (not useMemo): an effect cleanup that destroys a memoised instance would leave
  // a dead UndoManager behind whenever React re-runs effects (StrictMode, fast refresh).
  const [undo, setUndo] = useState<Y.UndoManager | null>(null);
  useEffect(() => {
    const um = new Y.UndoManager([doc.getArray('order'), doc.getMap('rows')], {
      trackedOrigins: new Set([LOCAL]),
    });
    setUndo(um);
    return () => um.destroy();
  }, [doc]);

  // awareness: who I am (name + a colour nobody else here has)
  usePresenceUser(awareness, account);
  useEffect(() => {
    awareness.setLocalStateField('sf', editing);
  }, [awareness, editing]);
  useEffect(() => {
    const update = () => {
      const list: Peer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID || !state?.user) return;
        list.push({
          clientId,
          name: state.user.name,
          color: state.user.color,
          cursor: state.sf ?? null,
        });
      });
      setPeers(list);
    };
    update();
    awareness.on('change', update);
    return () => {
      awareness.off('change', update);
      awareness.setLocalStateField('sf', null);
    };
  }, [awareness]);

  const issues = useMemo(() => {
    const map = new Map<string, RowIssue>();
    if (!rules) return map;
    for (const issue of checkRows(
      rules,
      rows.map(r => r.cells),
      1
    )) {
      const col = COLUMNS.find(c => c.label === issue.column)?.key;
      const row = rows[issue.row - 1];
      if (col && row) map.set(`${row.rowId}:${col}`, issue);
    }
    return map;
  }, [rules, rows]);

  const peerAt = useMemo(() => {
    const map = new Map<string, Peer>();
    for (const p of peers)
      if (p.cursor) map.set(`${p.cursor.rowId}:${p.cursor.col}`, p);
    return map;
  }, [peers]);

  const move = useCallback(
    (from: Cursor, dir?: 'down' | 'next' | 'prev') => {
      if (!dir) {
        setEditing(null);
        return;
      }
      const r = rows.findIndex(x => x.rowId === from.rowId);
      const c = COLUMN_KEYS.indexOf(from.col);
      if (dir === 'down') {
        const next = rows[r + 1];
        setEditing(next ? { rowId: next.rowId, col: from.col } : null);
      } else {
        const flat = r * COLUMN_KEYS.length + c + (dir === 'next' ? 1 : -1);
        const nr = rows[Math.floor(flat / COLUMN_KEYS.length)];
        setEditing(
          nr && flat >= 0
            ? { rowId: nr.rowId, col: COLUMN_KEYS[flat % COLUMN_KEYS.length] }
            : null
        );
      }
    },
    [rows]
  );

  const act = (fn: () => void) => doc.transact(fn, LOCAL);
  const insertAfter = (index: number) => {
    let ids: string[] = [];
    act(() => {
      sfSchema.initPlayscriptMeta(doc, guid, name);
      ids = sfSchema.insertRows(doc, index + 1, [['', '', '', '', '', '', '']]);
    });
    setEditing({ rowId: ids[0], col: 'name' });
  };

  const names = useMemo(
    () => [
      ...new Set([...(rules?.dialogNames ?? []), ...(rules?.chatNames ?? [])]),
    ],
    [rules]
  );
  const facesFor = (rowName: string) =>
    rules?.facesByName[rowName]?.length
      ? rules.facesByName[rowName]
      : (rules?.faces ?? []);

  return (
    <>
      <ViewTitle title={name} />
      <ViewIcon icon="collection" />
      <ViewHeader>
        <Header
          left={
            <div className={styles.header}>
              <WorkbenchLink to="/storyforge" className={styles.muted}>
                StoryForge 劇本 /
              </WorkbenchLink>
              <span>{name}</span>
              <span className={styles.pill}>🔒 欄位由模組固定</span>
            </div>
          }
          right={
            <div className={styles.avatars}>
              {peers.map(p => (
                <div
                  key={p.clientId}
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
        <div className={styles.body}>
          <div className={styles.toolbar}>
            <button
              className={styles.iconButton}
              onClick={() => undo?.undo()}
              title="只復原自己的操作"
            >
              ↶ 復原
            </button>
            <button className={styles.iconButton} onClick={() => undo?.redo()}>
              ↷ 重做
            </button>
            <span className={styles.pill}>{rows.length} 列</span>
            {!rules && (
              <span className={styles.muted}>
                還沒有規則 JSON（本機 StoryForge
                上傳後才會檢查名字、表情、功能）
              </span>
            )}
            {issues.size > 0 && (
              <span className={styles.issues}>
                ⚠ {issues.size} 格不合規（滑鼠移到紅框上看原因）
              </span>
            )}
          </div>
          <datalist id="sf-names">
            {names.map(n => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <datalist id="sf-funcs">
            {(rules?.functions ?? [])
              .filter(f => !f.legacy)
              .map(f => (
                <option key={f.name} value={f.name} label={f.param} />
              ))}
          </datalist>
          <table className={styles.table}>
            <colgroup>
              <col style={{ width: 64 }} />
              {COLUMNS.map(c => (
                <col key={c.key} style={{ width: WIDTHS[c.key] }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                {COLUMNS.map(c => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.rowId}>
                  <td className={styles.rowNumber}>
                    {i + 1}
                    <div className={styles.rowActions}>
                      <button
                        className={styles.iconButton}
                        title="在下面插入一列"
                        onClick={() => insertAfter(i)}
                      >
                        ＋
                      </button>
                      <button
                        className={styles.iconButton}
                        title="上移"
                        disabled={i === 0}
                        onClick={() =>
                          act(() => sfSchema.moveRows(doc, [row.rowId], i - 1))
                        }
                      >
                        ↑
                      </button>
                      <button
                        className={styles.iconButton}
                        title="下移"
                        disabled={i === rows.length - 1}
                        onClick={() =>
                          act(() => sfSchema.moveRows(doc, [row.rowId], i + 2))
                        }
                      >
                        ↓
                      </button>
                      <button
                        className={styles.iconButton}
                        title="刪除這一列"
                        onClick={() =>
                          act(() => sfSchema.deleteRows(doc, [row.rowId]))
                        }
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                  {COLUMN_KEYS.map((col, c) => {
                    const key = `${row.rowId}:${col}`;
                    const issue = issues.get(key);
                    const peer = peerAt.get(key);
                    const isEditing =
                      editing?.rowId === row.rowId && editing.col === col;
                    const listId =
                      col === 'name'
                        ? 'sf-names'
                        : col === 'func'
                          ? 'sf-funcs'
                          : col === 'face'
                            ? `sf-faces-${row.rowId}`
                            : undefined;
                    return (
                      <td
                        key={col}
                        style={
                          peer
                            ? { boxShadow: `inset 0 0 0 2px ${peer.color}` }
                            : undefined
                        }
                      >
                        {peer && (
                          <span
                            className={styles.remoteLabel}
                            style={{ background: peer.color }}
                          >
                            {peer.name} 編輯中
                          </span>
                        )}
                        {col === 'face' && isEditing && (
                          <datalist id={listId}>
                            {facesFor(row.cells[0]).map(f => (
                              <option key={f} value={f} />
                            ))}
                          </datalist>
                        )}
                        {isEditing ? (
                          <CellEditor
                            doc={doc}
                            ytext={cellText(doc, row.rowId, col)}
                            multiline={!SINGLE_LINE.has(col)}
                            listId={listId}
                            onClose={dir =>
                              move({ rowId: row.rowId, col }, dir)
                            }
                          />
                        ) : (
                          <div
                            className={
                              issue
                                ? `${styles.cell} ${styles.cellInvalid}`
                                : styles.cell
                            }
                            title={
                              issue
                                ? `${issue.message}${issue.allowed ? `\n可用：${issue.allowed.join('、')}` : ''}`
                                : col === 'param'
                                  ? paramHint(rules, row.cells[4])
                                  : undefined
                            }
                            onClick={() =>
                              setEditing({ rowId: row.rowId, col })
                            }
                          >
                            {row.cells[c]}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className={styles.addRow}
            onClick={() => insertAfter(rows.length - 1)}
          >
            ＋ 新增一列（不能新增欄位）
          </button>
          <div className={styles.muted} style={{ marginTop: 12 }}>
            這是 StoryForge
            的劇本表格，欄位固定；圖片、參考資料、討論請放在一般頁面。改動會即時同步給同時在看的人；本機
            StoryForge 要按「下載」才會拿到。
          </div>
        </div>
      </ViewBody>
    </>
  );
};

function paramHint(rules: ReturnType<typeof useSfRules>, func: string) {
  const f = rules?.functions.find(
    x => x.name.toLowerCase() === func.trim().toLowerCase()
  );
  return f?.param ? `參數格式：${f.param}` : undefined;
}

export const Component = () => <PlayscriptPage />;
