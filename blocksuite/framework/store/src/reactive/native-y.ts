import { Array as YArray, Map as YMap, Text as YText } from 'yjs';

import { Boxed } from './boxed.js';
import { isPureObject } from './is-pure-object.js';
import { Text } from './text/index.js';
import type { Native2Y, TransformOptions } from './types.js';

export function native2Y<T>(
  value: T,
  { deep = true, transform = x => x }: TransformOptions = {}
): Native2Y<T> {
  if (value instanceof Boxed) {
    return transform(value.yMap, value) as Native2Y<T>;
  }
  if (value instanceof Text) {
    if (value.yText.doc) {
      return transform(value.yText.clone(), value) as Native2Y<T>;
    }
    return transform(value.yText, value) as Native2Y<T>;
  }
  if (Array.isArray(value)) {
    const yArray: YArray<unknown> = new YArray<unknown>();
    const result = value.map(item => {
      return deep ? native2Y(item, { deep, transform }) : item;
    });
    yArray.insert(0, result);

    return transform(yArray, value) as Native2Y<T>;
  }
  if (isPureObject(value)) {
    const yMap = new YMap<unknown>();
    Object.entries(value).forEach(([key, value]) => {
      yMap.set(key, deep ? native2Y(value, { deep, transform }) : value);
    });

    return transform(yMap, value) as Native2Y<T>;
  }

  return transform(value, value) as Native2Y<T>;
}

const textOfYText = new WeakMap<YText, Text>();

export function y2Native(
  yAbstract: unknown,
  { deep = true, transform = x => x }: TransformOptions = {}
) {
  if (Boxed.is(yAbstract)) {
    const data = new Boxed(yAbstract);
    return transform(data, yAbstract);
  }
  if (yAbstract instanceof YText) {
    // NineDay: one Text per Y.Text. A Text reads all deltas and adds a Y.Text observer that is
    // never removed, and y2Native runs on a whole prop after every nested change: a database's
    // `cells` made a new Text (and observer) for every rich-text cell on each edit, so every cell
    // re-rendered and observers piled up. The Text keeps itself current through that observer.
    // Only Y.Texts already in a doc: a Text of a detached one starts empty.
    let data = textOfYText.get(yAbstract);
    if (!data) {
      data = new Text(yAbstract);
      if (yAbstract.doc) textOfYText.set(yAbstract, data);
    }
    return transform(data, yAbstract);
  }
  if (yAbstract instanceof YArray) {
    const data: unknown[] = yAbstract
      .toArray()
      .map(item => (deep ? y2Native(item, { deep, transform }) : item));

    return transform(data, yAbstract);
  }
  if (yAbstract instanceof YMap) {
    const data: Record<string, unknown> = Object.fromEntries(
      Array.from(yAbstract.entries()).map(([key, value]) => {
        return [key, deep ? y2Native(value, { deep, transform }) : value] as [
          string,
          unknown,
        ];
      })
    );
    return transform(data, yAbstract);
  }

  return transform(yAbstract, yAbstract);
}
