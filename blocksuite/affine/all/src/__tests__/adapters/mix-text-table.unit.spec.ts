import { MixTextAdapter } from '@blocksuite/affine-shared/adapters';
import type { BlockSnapshot } from '@blocksuite/store';
import { describe, expect, test } from 'vitest';

import { createJob } from '../utils/create-job.js';
import { getProvider } from '../utils/get-provider.js';

const provider = getProvider();

const text = (insert: string) => ({
  '$blocksuite:internal:text$': true,
  delta: insert ? [{ insert }] : [],
});

// NineDay: a copied table block becomes a Markdown table in text/plain.
describe('mix text from a table block', () => {
  test('rows and columns follow their order', async () => {
    const snapshot: BlockSnapshot = {
      type: 'block',
      id: 'note',
      flavour: 'affine:note',
      props: {},
      children: [
        {
          type: 'block',
          id: 'p',
          flavour: 'affine:paragraph',
          props: { type: 'text', text: text('Fruit') },
          children: [],
        },
        {
          type: 'block',
          id: 'table',
          flavour: 'affine:table',
          props: {
            columns: {
              c2: { columnId: 'c2', order: 'a1' },
              c1: { columnId: 'c1', order: 'a0' },
            },
            rows: {
              r2: { rowId: 'r2', order: 'a1' },
              r1: { rowId: 'r1', order: 'a0' },
            },
            cells: {
              'r1:c1': { text: text('Name') },
              'r1:c2': { text: text('Note') },
              'r2:c1': { text: text('Apple') },
              'r2:c2': { text: text('red | sweet') },
            },
          },
          children: [],
        },
      ],
    };

    const adapter = new MixTextAdapter(createJob(), provider);
    const { file } = await adapter.fromBlockSnapshot({ snapshot });

    expect(file).toBe(
      [
        'Fruit',
        '| Name | Note |',
        '| --- | --- |',
        '| Apple | red \\| sweet |',
      ].join('\n')
    );
  });
});
