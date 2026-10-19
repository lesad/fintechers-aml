export type TokenKind = "param" | "variable" | "field" | "constant" | "keyword" | "plain";

const KEYWORDS = new Set(["in", "true", "false"]);
const TOKEN = /(p\.\w+)|("[^"]*")|([a-z_][\w.]*)|(\d[\d.]*)|(\s+)|(&&|\|\||==|!=|>=|<=|.)/gi;

/** Splits a CEL condition into coloured tokens; joined back they are the source unchanged. */
export function conditionTokens(src: string, variables: Set<string>) {
  return [...src.matchAll(TOKEN)].map((m) => {
    const text = m[0];
    let kind: TokenKind = "plain";
    if (m[1]) kind = "param";
    else if (m[2] || m[4]) kind = "constant";
    else if (m[3])
      kind = KEYWORDS.has(text) ? "keyword" : variables.has(text) ? "variable" : "field";
    return { text, kind, at: m.index };
  });
}
