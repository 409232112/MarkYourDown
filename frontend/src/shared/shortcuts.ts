export interface ShortcutDef {
  id: string;
  label: string;
  key: string; // e.g. "Ctrl+S", "Ctrl+/"
  category: 'file' | 'edit' | 'format' | 'paragraph' | 'view' | 'navigation';
}

export const SHORTCUTS: Record<string, ShortcutDef> = {
  // File
  newFile: { id: 'newFile', label: '新建', key: 'Ctrl+N', category: 'file' },
  openFile: { id: 'openFile', label: '打开', key: 'Ctrl+O', category: 'file' },
  openFolder: { id: 'openFolder', label: '打开文件夹', key: 'Ctrl+Shift+O', category: 'file' },
  saveFile: { id: 'saveFile', label: '保存', key: 'Ctrl+S', category: 'file' },
  saveAsFile: { id: 'saveAsFile', label: '另存为', key: 'Ctrl+Shift+S', category: 'file' },
  closeTab: { id: 'closeTab', label: '关闭标签', key: 'Ctrl+W', category: 'file' },
  nextTab: { id: 'nextTab', label: '切换下一个标签', key: 'Ctrl+Tab', category: 'file' },
  prevTab: { id: 'prevTab', label: '切换上一个标签', key: 'Ctrl+Shift+Tab', category: 'file' },

  // Paragraph & Headings
  paragraph: { id: 'paragraph', label: '正文', key: 'Ctrl+0', category: 'paragraph' },
  heading1: { id: 'heading1', label: '标题 1', key: 'Ctrl+1', category: 'paragraph' },
  heading2: { id: 'heading2', label: '标题 2', key: 'Ctrl+2', category: 'paragraph' },
  heading3: { id: 'heading3', label: '标题 3', key: 'Ctrl+3', category: 'paragraph' },
  heading4: { id: 'heading4', label: '标题 4', key: 'Ctrl+4', category: 'paragraph' },
  heading5: { id: 'heading5', label: '标题 5', key: 'Ctrl+5', category: 'paragraph' },
  heading6: { id: 'heading6', label: '标题 6', key: 'Ctrl+6', category: 'paragraph' },
  upgradeHeading: { id: 'upgradeHeading', label: '升级标题', key: 'Ctrl+=', category: 'paragraph' },
  downgradeHeading: { id: 'downgradeHeading', label: '降级标题', key: 'Ctrl+-', category: 'paragraph' },

  // Format
  bold: { id: 'bold', label: '加粗', key: 'Ctrl+B', category: 'format' },
  italic: { id: 'italic', label: '斜体', key: 'Ctrl+I', category: 'format' },
  strikethrough: { id: 'strikethrough', label: '删除线', key: 'Alt+Shift+5', category: 'format' },
  inlineCode: { id: 'inlineCode', label: '行内代码', key: 'Ctrl+Shift+`', category: 'format' },
  underline: { id: 'underline', label: '下划线', key: 'Ctrl+U', category: 'format' },
  link: { id: 'link', label: '超链接', key: 'Ctrl+K', category: 'format' },
  image: { id: 'image', label: '插入图片', key: 'Ctrl+Shift+I', category: 'format' },

  // Blocks
  blockquote: { id: 'blockquote', label: '引用', key: 'Ctrl+Shift+Q', category: 'paragraph' },
  orderedList: { id: 'orderedList', label: '有序列表', key: 'Ctrl+Shift+[', category: 'paragraph' },
  unorderedList: { id: 'unorderedList', label: '无序列表', key: 'Ctrl+Shift+]', category: 'paragraph' },
  taskList: { id: 'taskList', label: '任务列表', key: 'Ctrl+Shift+X', category: 'paragraph' },
  codeBlock: { id: 'codeBlock', label: '代码块', key: 'Ctrl+Shift+K', category: 'paragraph' },
  mathBlock: { id: 'mathBlock', label: '公式块', key: 'Ctrl+Shift+M', category: 'paragraph' },
  table: { id: 'table', label: '表格', key: 'Ctrl+T', category: 'paragraph' },

  // Edit / Search
  find: { id: 'find', label: '查找', key: 'Ctrl+F', category: 'edit' },
  replace: { id: 'replace', label: '替换', key: 'Ctrl+H', category: 'edit' },

  // Mode switch
  toggleSourceMode: { id: 'toggleSourceMode', label: '源码模式', key: 'Ctrl+/', category: 'view' },

  // View / Layout
  toggleSidebar: { id: 'toggleSidebar', label: '侧栏', key: 'Ctrl+Shift+L', category: 'view' },
  showOutline: { id: 'showOutline', label: '大纲', key: 'Ctrl+Shift+1', category: 'view' },
  showFiles: { id: 'showFiles', label: '文件', key: 'Ctrl+Shift+2', category: 'view' },
  focusMode: { id: 'focusMode', label: '专注模式', key: 'F8', category: 'view' },
  typewriterMode: { id: 'typewriterMode', label: '打字机模式', key: 'F9', category: 'view' },
  fullscreen: { id: 'fullscreen', label: '全屏', key: 'F11', category: 'view' },
  zoomIn: { id: 'zoomIn', label: '放大', key: 'Ctrl+Shift+=', category: 'view' },
  zoomOut: { id: 'zoomOut', label: '缩小', key: 'Ctrl+Shift+-', category: 'view' },
  zoomReset: { id: 'zoomReset', label: '重置缩放', key: 'Ctrl+Shift+0', category: 'view' },
  settings: { id: 'settings', label: '设置', key: 'Ctrl+,', category: 'view' },
};
