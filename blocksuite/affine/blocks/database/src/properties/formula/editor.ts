import { css, html, LitElement } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { type FormulaResult, formulaResultText } from './compute.js';

/** Popup for writing a column's formula, with a live preview for one row. */
export class FormulaEditor extends LitElement {
  static override styles = css`
    :host {
      position: absolute;
      z-index: 999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 440px;
      max-width: calc(100vw - 16px);
      padding: 12px;
      border-radius: 8px;
      border: 0.5px solid var(--affine-border-color);
      background: var(--affine-background-overlay-panel-color);
      box-shadow: var(--affine-overlay-shadow);
      color: var(--affine-text-primary-color);
      font-family: var(--affine-font-family);
      font-size: 14px;
    }
    .title {
      font-weight: 600;
    }
    textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 72px;
      resize: vertical;
      padding: 8px;
      border-radius: 4px;
      border: 1px solid var(--affine-border-color);
      background: transparent;
      color: inherit;
      font-family: var(--affine-font-code-family, monospace);
      font-size: 13px;
      line-height: 20px;
      outline: none;
    }
    textarea:focus {
      border-color: var(--affine-primary-color);
    }
    .preview {
      min-height: 20px;
      font-size: 13px;
      color: var(--affine-text-secondary-color);
      word-break: break-word;
    }
    .preview.error {
      color: var(--affine-error-color);
    }
    .label {
      font-size: 12px;
      color: var(--affine-text-secondary-color);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      max-height: 96px;
      overflow-y: auto;
    }
    .chip {
      padding: 0 6px;
      border-radius: 4px;
      border: 1px solid var(--affine-border-color);
      background: var(--affine-hover-color);
      color: inherit;
      font: inherit;
      font-size: 12px;
      line-height: 20px;
      cursor: pointer;
    }
    .chip:hover {
      background: var(--affine-hover-color-filled);
    }
    .examples {
      margin: 0;
      padding-left: 16px;
      font-size: 12px;
      line-height: 18px;
      color: var(--affine-text-secondary-color);
    }
    code {
      font-family: var(--affine-font-code-family, monospace);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .actions button {
      padding: 2px 12px;
      border-radius: 4px;
      border: 1px solid var(--affine-border-color);
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .actions button.primary {
      border-color: var(--affine-primary-color);
      background: var(--affine-primary-color);
      color: var(--affine-white);
    }
  `;

  @property({ attribute: false })
  accessor expression = '';

  @property({ attribute: false })
  accessor properties: string[] = [];

  @property({ attribute: false })
  accessor preview: (expression: string) => FormulaResult = () => ({
    type: 'empty',
  });

  @property({ attribute: false })
  accessor onSave: (expression: string) => void = () => {};

  @property({ attribute: false })
  accessor onCancel: () => void = () => {};

  @state()
  accessor draft = '';

  @query('textarea')
  accessor textarea!: HTMLTextAreaElement;

  override connectedCallback() {
    super.connectedCallback();
    this.draft = this.expression;
    // Keep keys and clicks away from the database view and the page editor.
    for (const type of [
      'keydown',
      'keyup',
      'pointerdown',
      'mousedown',
      'copy',
      'cut',
      'paste',
    ]) {
      this.addEventListener(type, e => e.stopPropagation());
    }
  }

  override firstUpdated() {
    requestAnimationFrame(() => {
      this.textarea.focus();
      this.textarea.setSelectionRange(this.draft.length, this.draft.length);
    });
  }

  private insert(snippet: string) {
    const area = this.textarea;
    const start = area.selectionStart ?? this.draft.length;
    const end = area.selectionEnd ?? start;
    this.draft = this.draft.slice(0, start) + snippet + this.draft.slice(end);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  }

  private readonly onKeydown = (e: KeyboardEvent) => {
    if (e.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.onCancel();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.onSave(this.draft);
    }
  };

  override render() {
    const result = this.preview(this.draft);
    const isError = result.type === 'error';
    const text = isError ? result.message : formulaResultText(result);
    return html`
      <div class="title">Formula</div>
      <textarea
        spellcheck="false"
        placeholder='prop("Price") * prop("Qty")'
        .value=${this.draft}
        @input=${(e: InputEvent) => {
          this.draft = (e.target as HTMLTextAreaElement).value;
        }}
        @keydown=${this.onKeydown}
      ></textarea>
      <div class="preview ${isError ? 'error' : ''}">
        ${isError ? text : html`= ${text || '(empty)'}`}
      </div>
      <div class="label">Properties (click to insert)</div>
      <div class="chips">
        ${repeat(
          this.properties,
          name => name,
          name =>
            html`<button
              class="chip"
              @click=${() => this.insert(`prop("${name.replace(/"/g, '\\"')}")`)}
            >
              ${name}
            </button>`
        )}
      </div>
      <ul class="examples">
        <li><code>prop("Price") * prop("Qty")</code></li>
        <li><code>if(prop("Done"), "✅", "⏳")</code></li>
        <li><code>prop("Items").map(current.prop("Price")).sum()</code></li>
        <li>
          <code>prop("Items").filter(current.prop("Done")).length()</code>
        </li>
      </ul>
      <div class="actions">
        <button @click=${() => this.onCancel()}>Cancel</button>
        <button class="primary" @click=${() => this.onSave(this.draft)}>
          Done
        </button>
      </div>
    `;
  }
}
