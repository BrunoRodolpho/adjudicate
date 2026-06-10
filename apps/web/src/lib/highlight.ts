import { getSingletonHighlighter, type Highlighter } from "shiki";

/**
 * Build-time syntax highlighting for the editorial (blog) surface. Runs only in
 * server components, which are statically generated — so shiki executes during
 * `next build`, never ships to the client bundle, and adds zero runtime cost.
 *
 * A single cached highlighter is shared across all code blocks (getSingleton…
 * memoises on the theme+lang set). The inline background the theme emits on
 * `<pre>` is stripped so our own dark chrome surface shows through; only the
 * token colours survive.
 */
const THEME = "github-dark-default";
const LANGS = ["ts", "tsx", "js", "jsx", "json", "bash", "diff", "sql"] as const;
type Lang = (typeof LANGS)[number];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = getSingletonHighlighter({
      themes: [THEME],
      langs: [...LANGS],
    });
  }
  return highlighterPromise;
}

/** Returns shiki HTML (`<pre class="shiki">…`) with the inline bg stripped. */
export async function highlightToHtml(
  code: string,
  lang: string,
): Promise<string> {
  const safeLang: Lang = (LANGS as readonly string[]).includes(lang)
    ? (lang as Lang)
    : "ts";
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code, {
    lang: safeLang,
    theme: THEME,
    transformers: [
      {
        pre(node) {
          // Drop the theme's inline background-color so our bg-zinc-900 chrome
          // shows; keep everything else (token colours live on the spans).
          const style = String(node.properties.style ?? "");
          node.properties.style = style.replace(
            /background-color:[^;]+;?/g,
            "",
          );
        },
      },
    ],
  });
}
