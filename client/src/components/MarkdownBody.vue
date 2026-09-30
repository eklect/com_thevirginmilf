<script setup lang="ts">
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import { computed } from 'vue';

/**
 * Renders Markdown source: a review, her notes on a game, a stream's
 * description, the About and Privacy pages.
 *
 * ## This is the only `v-html` in the application
 *
 * That is deliberate and it is why the two settings below are not options.
 * The API is same-origin with this site, so anything that becomes live markup
 * runs with the session cookie in reach.
 *
 *  - `html: false` makes markdown-it ESCAPE raw HTML in the source rather than
 *    passing it through. A `<script>` in a review renders as the literal
 *    text `<script>`, which is what somebody typing it almost always meant.
 *  - DOMPurify then runs over markdown-it's own output. Belt and braces: the
 *    first setting means there should be nothing for it to strip, and it is
 *    cheap enough that "should" is not worth relying on alone.
 *
 * `linkify` is on, so bare URLs become links; `typographer` is off, because it
 * rewrites quotes and dashes and an author who typed a straight quote in a
 * code-adjacent sentence did not ask for that.
 *
 * ## Heading ids
 *
 * `markdown-it-anchor` gives every heading an `id` slugged from its text, so a
 * section of a long piece can be deep-linked. The
 * slug is plain: lowercase ASCII letters and digits, hyphens between words,
 * nothing else, so a heading called "We're Dree" becomes `were-dree` and the
 * hash reads like a URL rather than an encoding. `permalink` is left off; no
 * page here has a use for a ¶ beside every heading.
 *
 * DOMPurify keeps `id` by default and strips any value that would clobber a
 * DOM property (its `SANITIZE_DOM` guard), which is the right trade: a heading
 * unluckily named "Location" loses its anchor rather than shadowing
 * `document.location`.
 *
 * ## Footnotes
 *
 * markdown-it is CommonMark, and CommonMark has no footnotes, so `[^1]` in a
 * body rendered as the literal characters until `markdown-it-footnote` was
 * added. The syntax is the usual one: `[^1]` (or `[^any-label]`) in the text
 * and a `[^1]: the note` paragraph anywhere below, which may itself carry
 * emphasis and links. The notes render as an ordered list at the end of the
 * body with a return arrow after each; the marks and the list are styled under
 * `.markdown-body` in `styles.css`. Everything it emits is ids, classes and
 * same-page hrefs, all of which DOMPurify keeps by default.
 *
 * Note `com_loreingly/client/src/components/RichTextView.vue` does `v-html` on
 * generated HTML with no sanitizer at all. That is not the pattern to copy.
 */
const props = defineProps<{ source: string | null | undefined }>();

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  breaks: false,
}).use(anchor, {
  slugify: (text: string) =>
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '-'),
})
  .use(footnote);

// The plugin captions a reference as `[1]`. Inside a superscript the brackets
// read as an editing note, so the caption is the bare number.
md.renderer.rules.footnote_caption = (tokens, idx) => {
  const meta = tokens[idx].meta as { id: number; subId?: number };
  const n = String(meta.id + 1);
  return meta.subId && meta.subId > 0 ? `${n}:${meta.subId}` : n;
};

const rendered = computed(() => {
  const source = props.source ?? '';
  if (!source.trim()) return '';
  return DOMPurify.sanitize(md.render(source), {
    // `target` and `rel` so the hook below can do its work.
    ADD_ATTR: ['target', 'rel'],
  });
});
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- see the block comment above -->
  <div class="markdown-body" v-html="rendered" />
</template>
