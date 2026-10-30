import { InputRule, Node, wrappingInputRule } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type MarkdownIt from 'markdown-it';

/**
 * Footnotes in the visual editor, as real nodes.
 *
 * `MarkdownEditor` round-trips a body through TipTap: Markdown in, ProseMirror
 * document, Markdown out. StarterKit has no footnote node, so `[^1]` was plain
 * text to it, and on the way out the serializer did the correct thing for
 * literal brackets and escaped them: the column held `\[^1\]` and
 * `MarkdownBody` rendered the characters instead of a note. The first fix
 * swapped the syntax for a stand-in (`⟦^1⟧`) on the way in and back on the way
 * out, which saved footnotes that were already in the source but not ones
 * TYPED in the visual pane (they never passed through the swap), and showed
 * the author brackets rather than a footnote.
 *
 * So the pane now has two nodes:
 *
 *  - `footnoteReference`, an inline atom drawn as a superscript label, written
 *    out as `[^label]`. Typing `[^label]` anywhere but the start of a
 *    paragraph turns into one. One with no note of its label is marked as
 *    missing, since the published page prints it as text.
 *  - `footnoteDefinition`, a block drawn with its label in the margin, written
 *    out as `[^label]: ` with any further paragraphs indented four spaces, the
 *    way `markdown-it-footnote` reads them. Typing `[^label]: ` (or `[^label] `,
 *    colon forgotten) at the start of a paragraph turns it into one;
 *    Enter on an empty line inside leaves it, as in a quote.
 *
 * Parsing is ours, not `markdown-it-footnote`'s. That plugin only recognises a
 * reference whose definition exists, and it moves every definition to the end
 * and drops one nothing refers to — fine for the reader, but in an editor it
 * would rearrange somebody's source, and lose a note written before the
 * sentence that cites it. The two rules below recognise each piece on its
 * own, where it stands, and the published page still renders through the
 * plugin in `MarkdownBody`.
 *
 * `unescapeFootnotes` is the safety net for text that never became a node (a
 * paste, say): it turns the serializer's `\[^1\]` back into `[^1]`.
 */

/** The characters a label may not hold: what ends it, and whitespace. */
const LABEL_END = new Set([0x5d /* ] */, 0x5b /* [ */, 0x20, 0x09, 0x0a]);

function installFootnoteSyntax(md: MarkdownIt): void {
  // tiptap-markdown calls every extension's setup on every parse.
  if (md.renderer.rules.footnote_marker) return;
  const isSpace = md.utils.isSpace;
  const esc = md.utils.escapeHtml;

  // `[^label]` in running text.
  md.inline.ruler.after('image', 'footnote_marker', (state, silent) => {
    const start = state.pos;
    const max = state.posMax;
    if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false;
    if (state.src.charCodeAt(start + 1) !== 0x5e /* ^ */) return false;
    let pos = start + 2;
    while (pos < max && !LABEL_END.has(state.src.charCodeAt(pos))) pos++;
    if (pos === start + 2 || pos >= max || state.src.charCodeAt(pos) !== 0x5d) return false;
    if (!silent) {
      const token = state.push('footnote_marker', '', 0);
      token.meta = { label: state.src.slice(start + 2, pos) };
    }
    state.pos = pos + 1;
    return true;
  });

  // `[^label]: text` at a line start, with indented continuation lines. The
  // line bookkeeping is `markdown-it-footnote`'s own definition rule; only the
  // tokens differ, and they stay where the definition was written.
  //
  // The colon is easy to leave out, and `markdown-it-footnote` then sees no
  // note and prints the reference as text on the published page. So
  // `[^label] text` at a line start is read as a definition here too, and the
  // serializer writes it back WITH the colon: one visit to the editor mends it.
  md.block.ruler.before(
    'reference',
    'footnote_definition',
    (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      if (start + 4 > max) return false;
      if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false;
      if (state.src.charCodeAt(start + 1) !== 0x5e /* ^ */) return false;

      let pos = start + 2;
      while (pos < max && !LABEL_END.has(state.src.charCodeAt(pos))) pos++;
      if (pos === start + 2 || pos >= max || state.src.charCodeAt(pos) !== 0x5d) return false;
      const label = state.src.slice(start + 2, pos);
      if (pos + 1 >= max) return false;
      const after = state.src.charCodeAt(++pos);
      if (after === 0x3a /* : */) pos++;
      else if (!isSpace(after)) return false;
      if (silent) return true;

      const open = state.push('footnote_def_open', 'div', 1);
      open.meta = { label };

      const oldBMark = state.bMarks[startLine];
      const oldTShift = state.tShift[startLine];
      const oldSCount = state.sCount[startLine];
      const oldParentType = state.parentType;

      const posAfterColon = pos;
      const initial =
        state.sCount[startLine] + pos - (state.bMarks[startLine] + state.tShift[startLine]);
      let offset = initial;
      while (pos < max) {
        const ch = state.src.charCodeAt(pos);
        if (!isSpace(ch)) break;
        offset += ch === 0x09 ? 4 - (offset % 4) : 1;
        pos++;
      }

      state.tShift[startLine] = pos - posAfterColon;
      state.sCount[startLine] = offset - initial;
      state.bMarks[startLine] = posAfterColon;
      state.blkIndent += 4;
      // The type's union has no member for this; markdown-it-footnote uses the same value.
      state.parentType = 'footnote' as typeof state.parentType;
      if (state.sCount[startLine] < state.blkIndent) {
        state.sCount[startLine] += state.blkIndent;
      }

      state.md.block.tokenize(state, startLine, endLine);

      state.parentType = oldParentType;
      state.blkIndent -= 4;
      state.tShift[startLine] = oldTShift;
      state.sCount[startLine] = oldSCount;
      state.bMarks[startLine] = oldBMark;

      state.push('footnote_def_close', 'div', -1);
      return true;
    },
    { alt: ['paragraph', 'reference'] },
  );

  md.renderer.rules.footnote_marker = (tokens, idx) =>
    `<sup data-footnote-ref="${esc(tokens[idx].meta.label)}"></sup>`;
  md.renderer.rules.footnote_def_open = (tokens, idx) =>
    `<div data-footnote-def="${esc(tokens[idx].meta.label)}">`;
  md.renderer.rules.footnote_def_close = () => '</div>';
}

/** The `label` attribute both nodes carry, kept off the rendered element. */
const labelAttribute = {
  label: { default: '', parseHTML: () => null, renderHTML: () => ({}) },
};

export const FootnoteReference = Node.create({
  name: 'footnoteReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return labelAttribute;
  },

  parseHTML() {
    return [
      {
        tag: 'sup[data-footnote-ref]',
        getAttrs: (el) => ({ label: (el as HTMLElement).dataset.footnoteRef ?? '' }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      'sup',
      { class: 'footnote-marker', 'data-footnote-ref': node.attrs.label },
      node.attrs.label,
    ];
  },

  renderText({ node }) {
    return `[^${node.attrs.label}]`;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write(text: string): void }, node: { attrs: { label: string } }) {
          state.write(`[^${node.attrs.label}]`);
        },
        parse: { setup: installFootnoteSyntax },
      },
    };
  },

  /**
   * A reference with no note of that label is printed as text on the published
   * page (`markdown-it-footnote` only links a reference it can resolve), so
   * the editor marks it rather than drawing it like one that works.
   */
  addProseMirrorPlugins() {
    const missing = (doc: import('@tiptap/pm/model').Node): DecorationSet => {
      const notes = new Set<string>();
      doc.descendants((node) => {
        if (node.type.name === 'footnoteDefinition') notes.add(node.attrs.label);
      });
      const marks: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (node.type === this.type && !notes.has(node.attrs.label)) {
          marks.push(
            Decoration.node(pos, pos + node.nodeSize, {
              class: 'footnote-missing',
              title: `No note for this yet: start a paragraph with [^${node.attrs.label}]: `,
            }),
          );
        }
      });
      return DecorationSet.create(doc, marks);
    };
    return [new Plugin({ props: { decorations: (state) => missing(state.doc) } })];
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\^([^\][\s]+)\]$/,
        handler: ({ state, range, match }) => {
          // At the start of a paragraph this may be a definition on its way
          // (`[^1]: …`), so leave the text for the rule below. Returning null
          // is how a rule declines.
          if (range.from === state.doc.resolve(range.from).start()) return null;
          state.tr.replaceWith(range.from, range.to, this.type.create({ label: match[1] }));
        },
      }),
    ];
  },
});

export const FootnoteDefinition = Node.create({
  name: 'footnoteDefinition',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return labelAttribute;
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-footnote-def]',
        getAttrs: (el) => ({ label: (el as HTMLElement).dataset.footnoteDef ?? '' }),
      },
    ];
  },

  renderHTML({ node }) {
    return ['div', { class: 'footnote-definition', 'data-footnote-def': node.attrs.label }, 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: {
            wrapBlock(delim: string, first: string, node: unknown, f: () => void): void;
            renderContent(node: unknown): void;
          },
          node: { attrs: { label: string } },
        ) {
          state.wrapBlock('    ', `[^${node.attrs.label}]: `, node, () =>
            state.renderContent(node),
          );
        },
        parse: { setup: installFootnoteSyntax },
      },
    };
  },

  addInputRules() {
    return [
      wrappingInputRule({
        find: /^\[\^([^\][\s]+)\]:?\s$/,
        type: this.type,
        getAttributes: (match) => ({ label: match[1] }),
        // Two definitions in a row are two notes, never one.
        joinPredicate: () => false,
      }),
    ];
  },
});

/** The serializer's escaped `\[^1\]` (and `\_` inside a label) → `[^1]`. */
export function unescapeFootnotes(markdown: string): string {
  return markdown.replace(
    /\\\[\^((?:\\.|[^\]\\\s])+)\\\]/g,
    (_, label: string) => `[^${label.replace(/\\(.)/g, '$1')}]`,
  );
}
