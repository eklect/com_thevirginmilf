/**
 * Carries Markdown footnote syntax through the visual editor unharmed.
 *
 * `MarkdownEditor` round-trips a body through TipTap: Markdown in, ProseMirror
 * document, Markdown out. The document has no footnote node, so `[^1]` in the
 * text and `[^1]: the note` below it are plain text to it, and on the way out
 * the serializer does the correct thing for literal brackets and escapes
 * them. The stored source then reads `\[^1\]`, and `MarkdownBody` renders the
 * characters instead of a note. One visit to the visual pane would silently
 * strip every footnote from the About page.
 *
 * So the syntax is swapped for a form the serializer leaves alone before the
 * text goes in, and swapped back after it comes out. The stand-in uses the
 * mathematical white square brackets, `⟦^1⟧`, which nothing in the Markdown
 * grammar escapes and which no one types by accident. In the visual pane that
 * is what a footnote looks like, which is honest: the pane cannot do more
 * with it than show it.
 *
 * A definition must start a line. The visual pane can join two definitions
 * into one paragraph, so `restore` puts a definition back at a line start
 * whenever it finds one that is not.
 */

const REF = /\[\^([^\]\s]+)\](?!:)/g;
const DEF = /^[ \t]*\[\^([^\]\s]+)\]:/gm;
/** A stand-in definition that is NOT at a line start: something precedes it on the line. */
const STAND_IN_DEF_MIDLINE = /(?<=[^\n])[ \t]*⟦\^([^⟧\s]+)⟧:/g;
const STAND_IN_DEF = /⟦\^([^⟧\s]+)⟧:/g;
const STAND_IN_REF = /⟦\^([^⟧\s]+)⟧/g;

/** Markdown source → the form TipTap can hold without damaging it. */
export function protectFootnotes(markdown: string): string {
  return markdown.replace(DEF, '⟦^$1⟧:').replace(REF, '⟦^$1⟧');
}

/** TipTap's serialized output → Markdown source with footnotes restored. */
export function restoreFootnotes(markdown: string): string {
  return markdown
    .replace(STAND_IN_DEF_MIDLINE, '\n[^$1]:')
    .replace(STAND_IN_DEF, '[^$1]:')
    .replace(STAND_IN_REF, '[^$1]');
}
