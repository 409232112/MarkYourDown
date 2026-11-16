import remarkFrontmatter from 'remark-frontmatter';
import { $node, $remark } from '@milkdown/kit/utils';

// Recognize YAML front matter at the beginning of any Markdown document.
export const remarkYamlFrontmatter = $remark('yaml-frontmatter', () => remarkFrontmatter, ['yaml']);

export const frontmatterSchema = $node('frontmatter', () => ({
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  parseDOM: [{ tag: 'pre[data-frontmatter]' }],
  toDOM: () => ['pre', { 'data-frontmatter': '', class: 'myd-frontmatter' }, 0],
  parseMarkdown: {
    match: ({ type }) => type === 'yaml',
    runner: (state, node, type) => {
      state.openNode(type);
      if (node.value) state.addText(String(node.value));
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'frontmatter',
    runner: (state, node) => {
      state.addNode('yaml', undefined, node.textContent);
    },
  },
}));
