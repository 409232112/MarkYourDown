export interface BlockRecord {
  node: any; // PMNode
  start: number;
  end: number;
  gapBefore: string;
  children?: BlockRecord[];
}

export interface StyleProfile {
  bullet: '-' | '*' | '+';
  emphasis: '*' | '_';
  strong: '**' | '__';
  fence: '`' | '~';
  rule: '-' | '*' | '_';
  orderedDelim: '.' | ')';
  listIndent: 'one' | 'tab' | 'mixed';
  eol: 'lf' | 'crlf' | 'mixed';
}

export interface Baseline {
  src: string;
  doc: any; // PMNode
  blocks: BlockRecord[];
  tail: string;
  style: StyleProfile;
  fallbackFullSerialize?: boolean;
}

export interface DocState {
  id: string;
  path: string | null;
  title: string;
  mode: 'live' | 'source';
  eol: 'crlf' | 'lf' | 'mixed';
  encoding: 'utf8' | 'utf8bom' | 'gbk' | string;
  disk?: { mtimeMs: number; size: number; hash: string };
  status: 'clean' | 'dirty' | 'conflict' | 'deleted' | 'saveFailed';
  cursor?: unknown;
  scrollTop?: number;
}

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  pos: number; // ProseMirror doc pos or CM6 offset
}
