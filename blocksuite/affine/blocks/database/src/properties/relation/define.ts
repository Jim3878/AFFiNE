import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

import { EditorHostKey } from '../../context/host-context.js';

/**
 * NineDay: "Relation" column. A cell holds the ids of related docs (any doc in the
 * workspace, e.g. the row pages of another database). Ids are stored, so renaming a
 * doc keeps the relation; JSON/filtering see the doc titles.
 */
export const relationColumnType = propertyType('relation');

export const relationPropertyModelConfig = relationColumnType.modelConfig({
  name: 'Relation',
  propertyData: {
    schema: zod.object({}),
    default: () => ({}),
  },
  jsonValue: {
    schema: zod.array(zod.string()),
    type: () => t.array.instance(t.string.instance()),
    isEmpty: ({ value }) => value.length === 0,
  },
  rawValue: {
    schema: zod.array(zod.string()),
    default: () => [],
    toString: ({ value }) => value.join(','),
    fromString: ({ value, dataSource }) => {
      // Pasted text: comma separated doc titles (or ids) -> doc ids.
      const meta = dataSource.serviceGet(EditorHostKey)?.std.workspace.meta;
      const docs = (meta?.docMetas ?? []).filter(d => !d.trash);
      const ids: string[] = [];
      for (const part of value.split(',')) {
        const name = part.trim();
        if (!name) continue;
        const doc =
          docs.find(d => d.id === name) ?? docs.find(d => d.title === name);
        if (doc && !ids.includes(doc.id)) ids.push(doc.id);
      }
      return { value: ids };
    },
    toJson: ({ value, dataSource }) => {
      const meta = dataSource.serviceGet(EditorHostKey)?.std.workspace.meta;
      return value.map(id => meta?.getDocMeta(id)?.title || id);
    },
    fromJson: ({ value, dataSource }) => {
      if (!Array.isArray(value)) return undefined;
      const meta = dataSource.serviceGet(EditorHostKey)?.std.workspace.meta;
      const docs = meta?.docMetas ?? [];
      return value
        .map(v => docs.find(d => d.id === v || d.title === v)?.id)
        .filter((id): id is string => !!id);
    },
  },
});
