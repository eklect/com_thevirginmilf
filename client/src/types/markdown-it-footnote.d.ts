/**
 * `markdown-it-footnote` ships no types, and `@types/markdown-it-footnote`
 * pins an older `@types/markdown-it` that no longer matches markdown-it's
 * own bundled types, so the build fails on an unrelated `Utils` mismatch.
 * The plugin's whole surface is "a markdown-it plugin", so this is enough.
 */
declare module 'markdown-it-footnote' {
  import type { PluginSimple } from 'markdown-it';

  const footnote: PluginSimple;
  export default footnote;
}
