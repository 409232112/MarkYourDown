import type { StyleProfile } from '../../shared/types';

export function detectStyleProfile(src: string): StyleProfile {
  // 1. EOL detection
  const crlfCount = (src.match(/\r\n/g) || []).length;
  const lfOnlyCount = (src.replace(/\r\n/g, '').match(/\n/g) || []).length;
  let eol: 'lf' | 'crlf' | 'mixed' = 'lf';
  if (crlfCount > 0 && lfOnlyCount > 0) {
    eol = 'mixed';
  } else if (crlfCount > 0) {
    eol = 'crlf';
  }

  // 2. Bullet marker detection (-, *, +)
  let dashBullet = 0;
  let starBullet = 0;
  let plusBullet = 0;
  const bulletMatches = src.matchAll(/^[ \t]*([-*+])[ \t]+/gm);
  for (const m of bulletMatches) {
    const char = m[1];
    if (char === '-') dashBullet++;
    else if (char === '*') starBullet++;
    else if (char === '+') plusBullet++;
  }
  let bullet: '-' | '*' | '+' = '-';
  if (starBullet > dashBullet && starBullet >= plusBullet) {
    bullet = '*';
  } else if (plusBullet > dashBullet && plusBullet > starBullet) {
    bullet = '+';
  }

  // 3. Ordered list delimiter (. vs ))
  let dotDelim = 0;
  let parenDelim = 0;
  const orderedMatches = src.matchAll(/^[ \t]*\d+([.)])[ \t]+/gm);
  for (const m of orderedMatches) {
    if (m[1] === '.') dotDelim++;
    else if (m[1] === ')') parenDelim++;
  }
  const orderedDelim: '.' | ')' = parenDelim > dotDelim ? ')' : '.';

  // 4. Code block fence (` vs ~)
  const backtickFence = (src.match(/^[ \t]*`{3,}/gm) || []).length;
  const tildeFence = (src.match(/^[ \t]*~{3,}/gm) || []).length;
  const fence: '`' | '~' = tildeFence > backtickFence ? '~' : '`';

  // 5. Emphasis (* vs _)
  const starEmphasis = (src.match(/(?<!\*)\*[^*\s][^*]*\*(?!\*)/g) || []).length;
  const underEmphasis = (src.match(/(?<!_)_[^_\s][^_]*_(?!_)/g) || []).length;
  const emphasis: '*' | '_' = underEmphasis > starEmphasis ? '_' : '*';

  // 6. Strong (** vs __)
  const starStrong = (src.match(/\*\*[^*\s][^*]*\*\*/g) || []).length;
  const underStrong = (src.match(/__[^_\s][^_]*__/g) || []).length;
  const strong: '**' | '__' = underStrong > starStrong ? '__' : '**';

  // Strip frontmatter before detecting rules and other block styles
  let contentWithoutFrontmatter = src;
  if (src.startsWith('---')) {
    const endFm = src.indexOf('\n---', 3);
    if (endFm !== -1) {
      contentWithoutFrontmatter = src.slice(endFm + 4);
    }
  }

  // 7. Horizontal Rule (--- vs *** vs ___)
  let dashRule = 0;
  let starRule = 0;
  let underRule = 0;
  const ruleMatches = contentWithoutFrontmatter.matchAll(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm);
  for (const m of ruleMatches) {
    const char = m[1];
    if (char === '-') dashRule++;
    else if (char === '*') starRule++;
    else if (char === '_') underRule++;
  }
  let rule: '-' | '*' | '_' = '-';
  if (starRule > dashRule && starRule >= underRule) {
    rule = '*';
  } else if (underRule > dashRule && underRule > starRule) {
    rule = '_';
  }

  // 8. List indent (tab vs spaces)
  let tabIndent = 0;
  let spaceIndent = 0;
  const indentMatches = src.matchAll(/^(\t| {2,4})[-*+\d]/gm);
  for (const m of indentMatches) {
    if (m[1].startsWith('\t')) tabIndent++;
    else spaceIndent++;
  }
  let listIndent: 'one' | 'tab' | 'mixed' = 'one';
  if (tabIndent > 0 && spaceIndent > 0) {
    listIndent = 'mixed';
  } else if (tabIndent > spaceIndent) {
    listIndent = 'tab';
  }

  return {
    bullet,
    emphasis,
    strong,
    fence,
    rule,
    orderedDelim,
    listIndent,
    eol,
  };
}
