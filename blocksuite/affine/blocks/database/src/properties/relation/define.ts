import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

import { EditorHostKey } from '../../context/host-context.js';
import { listRows, resolveEntry } from './target.js';

/**
 * NineDay: "Relation" column, like Notion's: the column points at one database
 * (`target`), and each cell holds the ids of related rows of that database.
 * Entries that are doc ids (older values, Text -> Relation conversions) resolve
 * to the row whose title links that doc. Without a target, entries are docs.
 */
export const relationColumnType = propertyType('relation');

export const RelationPropertySchema = zod.object({
  target: zod
    .object({
      docId: zod.string(),
      blockId: zod.string(),
    })
    .optional(),
});
export type RelationPropertyData = zod.infer<typeof RelationPropertySchema>;

export const relationPropertyModelConfig = relationColumnType.modelConfig({
  name: 'Relation',
  propertyData: {
    schema: RelationPropertySchema,
    default: (): RelationPropertyData => ({}),
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
    fromString: ({ value, data, dataSource }) => {
      // Pasted text: comma separated titles (or ids) -> row ids (or doc ids).
      const std = dataSource.serviceGet(EditorHostKey)?.std;
      const names = value
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      const rows = std && data.target ? listRows(std, data.target) : undefined;
      const docs = (std?.workspace.meta.docMetas ?? []).filter(d => !d.trash);
      const ids: string[] = [];
      for (const name of names) {
        const id = rows
          ? (resolveEntry(rows, name) ?? rows.find(r => r.title === name))?.id
          : (docs.find(d => d.id === name) ?? docs.find(d => d.title === name))
              ?.id;
        if (id && !ids.includes(id)) ids.push(id);
      }
      return { value: ids };
    },
    toJson: ({ value, data, dataSource }) => {
      const std = dataSource.serviceGet(EditorHostKey)?.std;
      if (!std) return value;
      const rows = data.target ? listRows(std, data.target) : undefined;
      return value.map(entry =>
        rows
          ? (resolveEntry(rows, entry)?.title ?? entry)
          : std.workspace.meta.getDocMeta(entry)?.title || entry
      );
    },
    fromJson: ({ value }) =>
      Array.isArray(value) && value.every(v => typeof v === 'string')
        ? value
        : undefined,
  },
});
