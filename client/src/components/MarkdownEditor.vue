<script setup lang="ts">
import { Extension, InputRule } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { Markdown } from 'tiptap-markdown';
import { FootnoteDefinition, FootnoteReference, unescapeFootnotes } from '../lib/footnotes';
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import ImageInsertDialog from './ImageInsertDialog.vue';

/**
 * The long-form editor — a review, the About page, a stream's description: a
 * WYSIWYG that stores Markdown.
 *
 * ## The model value is a Markdown STRING, not TipTap JSON
 *
 * This is the one substantive difference from
 * `com_loreingly/client/src/components/RichTextEditor.vue`, which this is
 * otherwise adapted from. Loreingly persists `editor.getJSON()`; here the
 * column holds Markdown source, so the editor serializes out through
 * `editor.storage.markdown.getMarkdown()` and parses in through `setContent`
 * (which `tiptap-markdown` patches to accept a Markdown string).
 *
 * Markdown and not HTML because this API is same-origin with its own site:
 * stored HTML there is stored XSS with the session cookie in reach. See the
 * content standard in the estate docs; `com_alimucci` is the reference build
 * this component is copied from.
 *
 * ## Why the external-sync watch needs a guard
 *
 * Markdown is a lossy round trip in the reverse direction: TipTap may re-emit
 * semantically identical Markdown with different whitespace, so comparing the
 * incoming value against the editor's current serialization and calling
 * `setContent` on a mismatch re-enters on the editor's OWN output and moves
 * the caret to the end while somebody is typing.
 *
 * `lastEmitted` is the guard. The watch only acts on a value this component
 * did not produce — a load, or a reset — and ignores the echo of its own
 * emit. Do not replace it with a string comparison.
 *
 * ## Footnotes are nodes
 *
 * `[^1]` in the text and `[^1]: the note` below it parse into a
 * `footnoteReference` (drawn as a superscript) and a `footnoteDefinition`
 * (drawn with its label in the margin), and serialize back to the same
 * syntax; typing either form in the rich-text pane makes the node. Anything
 * the serializer still escapes on the way out, `unescapeFootnotes` puts back.
 * See `lib/footnotes.ts`.
 *
 * ## Images are opt-in (`adminImages`)
 *
 * With `admin-images` set the editor loads TipTap's image node, shows an Image
 * button in both panes and mounts `ImageInsertDialog`, which picks from the
 * image library or takes an address. A library image is stored as
 * `![alt](/api/uploads/<id>)`. The prop is for staff screens under
 * `views/admin/` only: the library is `/api/admin/uploads`, which nobody else
 * can reach. Without it nothing here changes: no node, no button, no dialog.
 *
 * The node is `inline: true` because the serializer tiptap-markdown ships for
 * it writes inline and never closes a block, so a block image came out glued
 * to the paragraph after it. `allowBase64: false` keeps a pasted screenshot
 * from landing in the column as a multi-megabyte `data:` URI.
 */
const props = defineProps<{
  modelValue: string;
  placeholder?: string;
  /** Staff screens only: the Image button and the image library. Off by default. */
  adminImages?: boolean;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

/**
 * `[label](url)` typed in the rich-text pane becomes a real link.
 *
 * StarterKit ships input rules for every other piece of Markdown syntax the
 * toolbar exposes — `**bold**`, `*italic*`, `` `code` ``, `## `, `- `, `1. `,
 * `> ` — so an author typing Markdown here watches it turn into formatting as
 * they go. Link syntax was the one gap: TipTap's Link extension autolinks a
 * bare URL and handles a pasted one, but has no rule for the bracket form.
 *
 * That gap was not cosmetic, it CORRUPTED the source. With no rule the text
 * stayed a plain text node, and the Markdown serializer then did the correct
 * thing for a literal bracket — escaped it — so the column ended up holding
 * `\[label\](url)`. MarkdownBody rendered that faithfully as the characters
 * `[label](url)`, and the page showed its own markup instead of a link.
 *
 * `markInputRule` cannot express this: it keeps `match[match.length - 1]` as
 * the visible text, which here is the URL rather than the label. Hence the
 * hand-written handler.
 */
const MarkdownLink = Extension.create({
  name: 'markdownLink',

  addInputRules() {
    return [
      new InputRule({
        // Anchored at the cursor — `find` is tested against the text before
        // it. The href excludes whitespace and parens so the rule ends at the
        // first `)` rather than running on through the rest of the line.
        find: /\[([^\]\n]+)\]\(([^()\s]+)\)$/,
        handler: ({ state, range, match }) => {
          const linkType = state.schema.marks.link;
          // Returning null is how a rule declines; anything else and the
          // runner dispatches whatever `tr` ended up with. So this is the ONLY
          // place allowed to return, and nothing below it may.
          if (!linkType) return null;

          const [, label, href] = match;
          // Taken once: `state` is the chainable state the runner built, so
          // this getter hands back the single shared transaction rather than
          // a fresh one per access.
          const { tr } = state;

          tr.replaceWith(
            range.from,
            range.to,
            state.schema.text(label, [linkType.create({ href })]),
          );
          // Without this the caret keeps the link mark and the next thing
          // typed silently joins the link.
          tr.removeStoredMark(linkType);
        },
      }),
    ];
  },
});


/** The last string this component emitted, so the watch can ignore its echo. */
const lastEmitted = ref<string | null>(null);

const editor = useEditor({
  content: props.modelValue || '',
  extensions: [
    StarterKit,
    FootnoteReference,
    FootnoteDefinition,
    MarkdownLink,
    // Read once, when the editor is made: the prop is a fixed attribute.
    ...(props.adminImages ? [Image.configure({ inline: true, allowBase64: false })] : []),
    // `html: false` is load-bearing — it stops raw HTML being parsed out of
    // the Markdown source, which is what keeps the "no stored HTML" property
    // true end to end. MarkdownBody.vue sets the same flag on the way out.
    Markdown.configure({ html: false, linkify: true, breaks: false }),
  ],
  editorProps: {
    attributes: {
      class: 'markdown-body min-h-[22rem] focus:outline-none',
    },
  },
  onUpdate: ({ editor }) => {
    const markdown = unescapeFootnotes(
      (editor.storage as any).markdown.getMarkdown() as string,
    );
    lastEmitted.value = markdown;
    emit('update:modelValue', markdown);
  },
});

watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value) return;
    if (value === lastEmitted.value) return; // our own echo
    editor.value.commands.setContent(value || '');
  },
);

// ── Raw Markdown mode ───────────────────────────────────────────────
// The toggle the brief asked for. In raw mode the textarea IS the model — no
// round trip through TipTap at all — so switching back and forth cannot
// normalize somebody's source out from under them.
const raw = ref(false);
const rawTextarea = ref<HTMLTextAreaElement | null>(null);

function toggleRaw(): void {
  raw.value = !raw.value;
  if (!raw.value && editor.value) {
    editor.value.commands.setContent(props.modelValue || '');
  }
}

function onRawInput(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  lastEmitted.value = value;
  emit('update:modelValue', value);
}

// ── Toolbar ─────────────────────────────────────────────────────────

function setLink(): void {
  if (!editor.value) return;
  const previous = editor.value.getAttributes('link').href as string | undefined;
  const href = window.prompt('Link URL (leave blank to remove)', previous ?? '');
  if (href === null) return;
  const chain = editor.value.chain().focus().extendMarkRange('link');
  if (!href) chain.unsetLink().run();
  else chain.setLink({ href }).run();
}

const imageOpen = ref(false);

/**
 * The dialog's result, placed wherever the author is working.
 *
 * Rich text gets a real image node. Raw mode gets the Markdown spliced into
 * the textarea at the selection, through the same emit path as typing, so the
 * `lastEmitted` guard still recognises the value as this component's own.
 */
function onImageInsert({ src, alt }: { src: string; alt: string }): void {
  if (!raw.value) {
    editor.value?.chain().focus().setImage({ src, alt }).run();
    return;
  }

  const area = rawTextarea.value;
  const current = props.modelValue || '';
  const start = area?.selectionStart ?? current.length;
  const end = area?.selectionEnd ?? start;
  // Brackets and parens in the alt or address would end the syntax early.
  const safeAlt = alt.replace(/[\[\]]/g, '\\$&');
  const safeSrc = src.replace(/[()\s]/g, (c) => encodeURIComponent(c));
  const snippet = `![${safeAlt}](${safeSrc})`;
  const value = current.slice(0, start) + snippet + current.slice(end);

  lastEmitted.value = value;
  emit('update:modelValue', value);

  void nextTick(() => {
    if (!area) return;
    const caret = start + snippet.length;
    area.focus();
    area.setSelectionRange(caret, caret);
  });
}

const isActive = (name: string, attrs?: Record<string, unknown>) =>
  editor.value?.isActive(name, attrs) ?? false;

/**
 * The toolbar button's classes.
 *
 * A function rather than a `<style scoped>` block with `@apply`: Tailwind v4
 * compiles each SFC style block in isolation, so `@apply` there needs an
 * `@reference` to this app's stylesheet and silently fails the build without
 * one. Utilities in the template are what the rest of the estate does anyway.
 */
const tb = (on = false): string =>
  [
    'flex h-7 min-w-7 items-center justify-center border border-transparent px-1.5 font-head text-xs',
    on ? 'bg-accent text-accent-text' : 'text-muted hover:border-border hover:text-text',
  ].join(' ');

onBeforeUnmount(() => editor.value?.destroy());
</script>

<template>
  <div class="border border-border bg-surface">
    <div class="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
      <template v-if="!raw">
        <button
          type="button"
          :class="tb(isActive('bold'))"
          title="Bold"
          @click="editor?.chain().focus().toggleBold().run()"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          :class="tb(isActive('italic'))"
          title="Italic"
          @click="editor?.chain().focus().toggleItalic().run()"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          :class="tb(isActive('heading', { level: 2 }))"
          title="Heading"
          @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"
        >
          H2
        </button>
        <button
          type="button"
          :class="tb(isActive('heading', { level: 3 }))"
          title="Subheading"
          @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()"
        >
          H3
        </button>
        <button
          type="button"
          :class="tb(isActive('bulletList'))"
          title="Bullet list"
          @click="editor?.chain().focus().toggleBulletList().run()"
        >
          •
        </button>
        <button
          type="button"
          :class="tb(isActive('orderedList'))"
          title="Numbered list"
          @click="editor?.chain().focus().toggleOrderedList().run()"
        >
          1.
        </button>
        <button
          type="button"
          :class="tb(isActive('blockquote'))"
          title="Quote"
          @click="editor?.chain().focus().toggleBlockquote().run()"
        >
          ❝
        </button>
        <button
          type="button"
          :class="tb(isActive('code'))"
          title="Code"
          @click="editor?.chain().focus().toggleCode().run()"
        >
          &lt;/&gt;
        </button>
        <button type="button" :class="tb(isActive('link'))" title="Link" @click="setLink">
          🔗
        </button>
        <button
          v-if="adminImages"
          type="button"
          :class="tb(isActive('image'))"
          title="Image"
          @click="imageOpen = true"
        >
          🖼
        </button>
      </template>
      <template v-else>
        <span class="kicker px-1">Markdown source</span>
        <button
          v-if="adminImages"
          type="button"
          :class="tb()"
          title="Image"
          @click="imageOpen = true"
        >
          🖼
        </button>
      </template>

      <span class="flex-1" />

      <button type="button" :class="tb(raw)" @click="toggleRaw">
        {{ raw ? 'Rich text' : 'Markdown' }}
      </button>
    </div>

    <textarea
      v-if="raw"
      ref="rawTextarea"
      :value="modelValue"
      class="min-h-[22rem] w-full resize-y bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed focus:outline-none"
      spellcheck="false"
      :placeholder="placeholder"
      @input="onRawInput"
    />
    <EditorContent v-else :editor="editor" class="px-4 py-3" />

    <ImageInsertDialog v-if="adminImages" v-model:open="imageOpen" @insert="onImageInsert" />
  </div>
</template>

