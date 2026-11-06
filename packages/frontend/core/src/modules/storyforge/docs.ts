// NineDay StoryForge module: opens StoryForge's own Y.Docs (db$sf.project, db$sf.rules,
// db$sf.playscript.<guid>) through the workspace's normal doc engine. nbstore maps the local id
// `db$<name>` to the server id `db$<workspaceId>$<name>`, the same way AFFiNE's own db$folders works.
import type { Workspace } from '@affine/core/modules/workspace';
import { useEffect, useMemo, useState } from 'react';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { parseRules, type Rules } from './shared/rules';
import {
  createSchema,
  type PlayscriptIndexEntry,
  type RowWithId,
} from './shared/schema';

export const sfSchema = createSchema(Y);

type Entry = { doc: Y.Doc; awareness?: Awareness };
const cache = new WeakMap<Workspace, Map<string, Entry>>();

function entry(workspace: Workspace, name: string): Entry {
  let docs = cache.get(workspace);
  if (!docs) {
    docs = new Map();
    cache.set(workspace, docs);
  }
  let e = docs.get(name);
  if (!e) {
    const doc = new Y.Doc({ guid: `db$${name}` });
    workspace.engine.doc.connectDoc(doc);
    workspace.engine.doc.addPriority(doc.guid, 100);
    e = { doc };
    docs.set(name, e);
  }
  return e;
}

export function getSfDoc(workspace: Workspace, name: string) {
  return entry(workspace, name).doc;
}

export function getSfAwareness(workspace: Workspace, name: string) {
  const e = entry(workspace, name);
  if (!e.awareness) {
    e.awareness = new Awareness(e.doc);
    workspace.engine.awareness.connectAwareness(e.awareness);
  }
  return e.awareness;
}

/** Re-renders on every change to the doc (local or remote). */
export function useYDocVersion(doc: Y.Doc | null) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!doc) return;
    // Batched with a timer, not requestAnimationFrame: rAF stops while the tab is in the background,
    // which would freeze the table for someone who has it open next to another window.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        setVersion(v => v + 1);
      }, 16);
    };
    doc.on('update', onUpdate);
    return () => {
      doc.off('update', onUpdate);
      if (timer) clearTimeout(timer);
    };
  }, [doc]);
  return version;
}

export function useSfProject(workspace: Workspace): {
  exists: boolean;
  schemaVersion: number;
  flowGraphEnabled: boolean;
  playscripts: PlayscriptIndexEntry[];
} {
  const doc = useMemo(() => getSfDoc(workspace, 'sf.project'), [workspace]);
  const version = useYDocVersion(doc);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => sfSchema.readProject(doc), [doc, version]);
}

export function useSfRules(workspace: Workspace): Rules | null {
  const doc = useMemo(() => getSfDoc(workspace, 'sf.rules'), [workspace]);
  const version = useYDocVersion(doc);
  return useMemo(() => {
    const r = sfSchema.readRules(doc);
    if (!r) return null;
    try {
      return parseRules(r.json);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, version]);
}

export function usePlayscriptDoc(workspace: Workspace, guid: string) {
  const doc = useMemo(
    () => getSfDoc(workspace, `sf.playscript.${guid}`),
    [workspace, guid]
  );
  const version = useYDocVersion(doc);
  const rows: RowWithId[] = useMemo(
    () => sfSchema.readPlayscript(doc).rows,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, version]
  );
  return { doc, rows, version };
}
