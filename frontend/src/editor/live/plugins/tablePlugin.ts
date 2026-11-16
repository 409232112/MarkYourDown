import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  addRowAfter,
  addRowBefore,
  deleteRow,
  deleteTable,
  goToNextCell,
  setCellAttr,
  findTable,
  TableMap,
} from '@milkdown/kit/prose/tables';

function resizeTable(view: EditorView, targetRows: number, targetCols: number) {
  const table = findTable(view.state.selection.$from);
  if (!table) return;
  let map = TableMap.get(table.node);

  // Adjust columns
  while (map.width < targetCols && map.width < 12) {
    addColumnAfter(view.state, view.dispatch);
    const updated = findTable(view.state.selection.$from);
    if (!updated) break;
    map = TableMap.get(updated.node);
  }
  while (map.width > targetCols && map.width > 1) {
    deleteColumn(view.state, view.dispatch);
    const updated = findTable(view.state.selection.$from);
    if (!updated) break;
    map = TableMap.get(updated.node);
  }

  // Adjust rows
  while (map.height < targetRows && map.height < 30) {
    addRowAfter(view.state, view.dispatch);
    const updated = findTable(view.state.selection.$from);
    if (!updated) break;
    map = TableMap.get(updated.node);
  }
  while (map.height > targetRows && map.height > 1) {
    deleteRow(view.state, view.dispatch);
    const updated = findTable(view.state.selection.$from);
    if (!updated) break;
    map = TableMap.get(updated.node);
  }
}

export class TableToolbar {
  private dom: HTMLElement;
  private view: EditorView;
  private activeTable: HTMLElement | null = null;
  private tooltipEl: HTMLElement;
  private gridPopover: HTMLElement;
  private moreDropdown: HTMLElement;
  private gridCells: HTMLElement[] = [];
  private gridIndicator: HTMLElement;

  constructor(view: EditorView) {
    this.view = view;

    // Main toolbar container
    this.dom = document.createElement('div');
    this.dom.className = 'myd-table-toolbar';
    this.dom.style.display = 'none';

    // Tooltip element
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'myd-table-tooltip';
    document.body.appendChild(this.tooltipEl);

    // Left controls
    const leftDiv = document.createElement('div');
    leftDiv.className = 'myd-table-toolbar-left';

    // 1. Grid matrix picker button
    const gridBtn = this.createIconButton(
      `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`,
      '调整表格',
      () => this.toggleGridPopover()
    );
    leftDiv.appendChild(gridBtn);

    // 2. Align left button
    const alignLeftBtn = this.createIconButton(
      `<svg viewBox="0 0 16 16" width="14" height="14"><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="2" y1="8" x2="9" y2="8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="2" y1="12" x2="12" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
      '左对齐',
      () => {
        setCellAttr('alignment', 'left')(this.view.state, this.view.dispatch);
        this.view.focus();
      }
    );
    leftDiv.appendChild(alignLeftBtn);

    // 3. Align center button
    const alignCenterBtn = this.createIconButton(
      `<svg viewBox="0 0 16 16" width="14" height="14"><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="4.5" y1="8" x2="11.5" y2="8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="3" y1="12" x2="13" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
      '居中',
      () => {
        setCellAttr('alignment', 'center')(this.view.state, this.view.dispatch);
        this.view.focus();
      }
    );
    leftDiv.appendChild(alignCenterBtn);

    // 4. Align right button
    const alignRightBtn = this.createIconButton(
      `<svg viewBox="0 0 16 16" width="14" height="14"><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="7" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="4" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
      '右对齐',
      () => {
        setCellAttr('alignment', 'right')(this.view.state, this.view.dispatch);
        this.view.focus();
      }
    );
    leftDiv.appendChild(alignRightBtn);

    this.dom.appendChild(leftDiv);

    // Right controls
    const rightDiv = document.createElement('div');
    rightDiv.className = 'myd-table-toolbar-right';

    // 5. More operations button
    const moreBtn = this.createIconButton(
      `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>`,
      '更多操作',
      () => this.toggleMoreDropdown()
    );
    rightDiv.appendChild(moreBtn);

    // 6. Delete table button
    const deleteBtn = this.createIconButton(
      `<svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 4h10M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M4.5 4v9a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      '删除表格',
      () => {
        deleteTable(this.view.state, this.view.dispatch);
        this.hide();
        this.view.focus();
      }
    );
    rightDiv.appendChild(deleteBtn);

    this.dom.appendChild(rightDiv);

    // Build Grid Matrix Picker Popover (6 x 6)
    this.gridPopover = document.createElement('div');
    this.gridPopover.className = 'myd-table-grid-popover';
    this.gridPopover.style.display = 'none';

    const matrixContainer = document.createElement('div');
    matrixContainer.className = 'myd-table-grid-matrix';

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const cell = document.createElement('div');
        cell.className = 'myd-table-grid-cell';
        cell.dataset.row = r.toString();
        cell.dataset.col = c.toString();

        cell.addEventListener('mouseenter', () => {
          this.highlightGrid(r, c);
        });

        cell.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          resizeTable(this.view, r + 1, c + 1);
          this.gridPopover.style.display = 'none';
          this.view.focus();
        });

        this.gridCells.push(cell);
        matrixContainer.appendChild(cell);
      }
    }
    this.gridPopover.appendChild(matrixContainer);

    this.gridIndicator = document.createElement('div');
    this.gridIndicator.className = 'myd-table-grid-indicator';
    this.gridIndicator.textContent = '2 x 2';
    this.gridPopover.appendChild(this.gridIndicator);

    this.dom.appendChild(this.gridPopover);

    // Build More Dropdown
    this.moreDropdown = document.createElement('div');
    this.moreDropdown.className = 'myd-table-more-dropdown';
    this.moreDropdown.style.display = 'none';

    this.addDropdownItem('在上方插入行', () => addRowBefore(this.view.state, this.view.dispatch));
    this.addDropdownItem('在下方插入行', () => addRowAfter(this.view.state, this.view.dispatch));
    this.addDropdownItem('在左侧插入列', () => addColumnBefore(this.view.state, this.view.dispatch));
    this.addDropdownItem('在右侧插入列', () => addColumnAfter(this.view.state, this.view.dispatch));

    const divider = document.createElement('div');
    divider.className = 'myd-table-menu-divider';
    this.moreDropdown.appendChild(divider);

    this.addDropdownItem('删除当前行', () => deleteRow(this.view.state, this.view.dispatch));
    this.addDropdownItem('删除当前列', () => deleteColumn(this.view.state, this.view.dispatch));

    this.dom.appendChild(this.moreDropdown);
  }

  private scrollContainer: HTMLElement | null = null;

  private onScroll = () => {
    if (this.activeTable && this.dom.style.display !== 'none') {
      this.updatePosition();
    }
  };

  private createIconButton(svgIcon: string, tooltipText: string, action: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'myd-table-btn';
    btn.innerHTML = svgIcon;

    btn.addEventListener('mouseenter', () => {
      this.showTooltip(btn, tooltipText);
    });

    btn.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      action();
    });

    return btn;
  }

  private addDropdownItem(text: string, action: () => boolean) {
    const item = document.createElement('div');
    item.className = 'myd-table-menu-item';
    item.textContent = text;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      action();
      this.moreDropdown.style.display = 'none';
      this.view.focus();
    });
    this.moreDropdown.appendChild(item);
  }

  private highlightGrid(maxRow: number, maxCol: number) {
    for (const cell of this.gridCells) {
      const r = parseInt(cell.dataset.row || '0', 10);
      const c = parseInt(cell.dataset.col || '0', 10);
      if (r <= maxRow && c <= maxCol) {
        cell.classList.add('highlight');
      } else {
        cell.classList.remove('highlight');
      }
    }
    this.gridIndicator.textContent = `${maxRow + 1} x ${maxCol + 1}`;
  }

  private toggleGridPopover() {
    this.moreDropdown.style.display = 'none';
    const isOpen = this.gridPopover.style.display === 'flex';
    this.gridPopover.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) {
      // Highlight initial 2x2
      this.highlightGrid(1, 1);
    }
  }

  private toggleMoreDropdown() {
    this.gridPopover.style.display = 'none';
    const isOpen = this.moreDropdown.style.display === 'flex';
    this.moreDropdown.style.display = isOpen ? 'none' : 'flex';
  }

  private showTooltip(targetEl: HTMLElement, text: string) {
    this.tooltipEl.textContent = text;
    const rect = targetEl.getBoundingClientRect();
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
    this.tooltipEl.style.top = `${rect.bottom + 6}px`;
  }

  private hideTooltip() {
    this.tooltipEl.style.display = 'none';
  }

  public updatePosition() {
    if (!this.activeTable) return;
    const container = this.scrollContainer || (this.view.dom.closest('.editor-host-container') as HTMLElement);
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const tableRect = this.activeTable.getBoundingClientRect();

    if (tableRect.bottom < containerRect.top || tableRect.top > containerRect.bottom) {
      this.dom.style.display = 'none';
      return;
    }

    const top = tableRect.top - containerRect.top + container.scrollTop;
    const left = tableRect.left - containerRect.left + container.scrollLeft;

    this.dom.style.display = 'flex';
    this.dom.style.position = 'absolute';
    this.dom.style.left = `${Math.max(8, left)}px`;
    this.dom.style.width = `${Math.max(160, tableRect.width)}px`;
    this.dom.style.top = `${Math.max(0, top - 30)}px`;
    this.dom.style.zIndex = '999';
  }

  public show(tableEl: HTMLElement) {
    this.activeTable = tableEl;
    const container = this.view.dom.closest('.editor-host-container') as HTMLElement;
    if (container && this.dom.parentElement !== container) {
      container.appendChild(this.dom);
      if (this.scrollContainer !== container) {
        this.scrollContainer?.removeEventListener('scroll', this.onScroll);
        this.scrollContainer = container;
        this.scrollContainer.addEventListener('scroll', this.onScroll);
      }
    }
    this.updatePosition();
  }

  public hide() {
    this.dom.style.display = 'none';
    this.gridPopover.style.display = 'none';
    this.moreDropdown.style.display = 'none';
    this.hideTooltip();
    this.activeTable = null;
  }

  public destroy() {
    this.scrollContainer?.removeEventListener('scroll', this.onScroll);
    this.dom.remove();
    this.tooltipEl.remove();
  }
}

export function createTablePlugin(): Plugin {
  let toolbar: TableToolbar | null = null;

  return new Plugin({
    key: new PluginKey('myd-table-helper'),
    view(editorView) {
      toolbar = new TableToolbar(editorView);
      return {
        update(view) {
          // Check if cursor is inside a table
          const { selection } = view.state;
          let inTable = false;
          for (let d = selection.$from.depth; d > 0; d--) {
            const n = selection.$from.node(d);
            if (n.type.name === 'table') {
              inTable = true;
              break;
            }
          }

          if (inTable) {
            try {
              const domNode = view.domAtPos(selection.$from.pos).node;
              const tableEl = (domNode instanceof HTMLElement ? domNode : domNode.parentElement)?.closest('table');
              if (tableEl && toolbar) {
                toolbar.show(tableEl as HTMLElement);
                return;
              }
            } catch {
              // pos might be between nodes during fast edits
            }
          }
          toolbar?.hide();
        },
        destroy() {
          toolbar?.destroy();
          toolbar = null;
        },
      };
    },
    props: {
      handleKeyDown(view, event) {
        const { state, dispatch } = view;
        const { selection } = state;

        // Check if inside table cell
        let inCell = false;
        for (let d = selection.$from.depth; d > 0; d--) {
          const name = selection.$from.node(d).type.name;
          if (name === 'table_cell' || name === 'table_header') {
            inCell = true;
            break;
          }
        }

        if (!inCell) return false;

        // Tab: navigate cell or add new row at end
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          const moved = goToNextCell(1)(state, dispatch);
          if (!moved) {
            addRowAfter(state, dispatch);
            goToNextCell(1)(view.state, dispatch);
          }
          return true;
        }

        // Shift+Tab: previous cell
        if (event.key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          return goToNextCell(-1)(state, dispatch);
        }

        // Enter: insert <br> within cell
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
          event.preventDefault();
          const hardBreak = state.schema.nodes.hard_break;
          if (hardBreak) {
            dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
            return true;
          }
        }

        return false;
      },
    },
  });
}
