import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

import {
  type FormulaPropertyData,
  type FormulaResult,
  formulaResultText,
} from './compute.js';

export const formulaColumnType = propertyType('formula');

const FormulaPropertySchema = zod.object({
  expression: zod.string(),
  resultType: zod.enum(['number', 'text', 'boolean', 'date', 'list']),
});

type FormulaJson = number | string | boolean | string[] | null;

export const formulaPropertyModelConfig = formulaColumnType.modelConfig({
  name: 'Formula',
  propertyData: {
    schema: FormulaPropertySchema,
    default: (): FormulaPropertyData => ({
      expression: '',
      resultType: 'text',
    }),
  },
  jsonValue: {
    schema: zod.any() as zod.ZodType<FormulaJson>,
    isEmpty: ({ value }) =>
      value == null || value === '' || (Array.isArray(value) && !value.length),
    type: ({ data }) => {
      switch (data.resultType) {
        case 'number':
          return t.number.instance();
        case 'boolean':
          return t.boolean.instance();
        case 'date':
          return t.date.instance();
        case 'list':
          return t.array.instance(t.string.instance());
        default:
          return t.string.instance();
      }
    },
  },
  rawValue: {
    // Computed by the data source on every read (see `spacialProperties`).
    schema: zod.any() as zod.ZodType<FormulaResult>,
    default: (): FormulaResult => ({ type: 'empty' }),
    toString: ({ value }) => formulaResultText(value),
    fromString: () => ({ value: undefined }),
    toJson: ({ value, data }): FormulaJson => {
      if (!value || value.type === 'empty' || value.type === 'error') {
        return null;
      }
      if (data.resultType === 'text') return formulaResultText(value);
      if (value.type === data.resultType) return value.value;
      return null;
    },
    setValue: () => {},
  },
});
