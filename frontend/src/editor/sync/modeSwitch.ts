import type { Baseline, DocState } from '../../shared/types';
import { globalImeGuard } from './ime';
import { mapLiveToSource, mapSourceToLive } from './cursorMap';
import { serializeWithBaseline } from '../fidelity/serializeWithBaseline';
import { buildBaseline } from '../fidelity/baseline';

export interface ModeSwitchHandlers {
  onStatusMessage?: (msg: string) => void;
  onError?: (err: Error) => void;
}

export class ModeSwitchCoordinator {
  private isSwitching = false;

  constructor(private handlers: ModeSwitchHandlers = {}) {}

  /**
   * Switches from Live (Milkdown) to Source (CodeMirror 6).
   */
  public async switchLiveToSource(options: {
    pmDoc: any;
    pmPos: number;
    baseline: Baseline;
    docState: DocState;
    serializer?: (node: any) => string;
    onDestroyLive: () => void;
    onInitSource: (text: string, initialOffset: number) => void;
  }): Promise<{ newBaseline: Baseline; sourceOffset: number } | null> {
    if (this.isSwitching) return null;

    // 1. If currently in IME composition, wait until composition ends
    if (globalImeGuard.composing) {
      return new Promise((resolve) => {
        globalImeGuard.executeOrDefer(async () => {
          const res = await this.switchLiveToSource(options);
          resolve(res);
        });
      });
    }

    this.isSwitching = true;
    try {
      // 2. Serialize PM doc with fidelity baseline
      const { text, newBaseline } = serializeWithBaseline(
        options.pmDoc,
        options.baseline,
        options.serializer
      );

      // 3. Map cursor position
      const cursorResult = mapLiveToSource(options.pmPos, options.pmDoc, newBaseline);

      // 4. Destroy PM view
      options.onDestroyLive();

      // 5. Initialize CM6 state with new text and clean undo history
      options.onInitSource(text, cursorResult.offset);

      // 6. Update document state
      options.docState.mode = 'source';
      if (this.handlers.onStatusMessage) {
        this.handlers.onStatusMessage('已切换到源码模式');
      }

      return { newBaseline, sourceOffset: cursorResult.offset };
    } catch (err: any) {
      if (this.handlers.onError) {
        this.handlers.onError(err);
      }
      return null;
    } finally {
      this.isSwitching = false;
    }
  }

  /**
   * Switches from Source (CodeMirror 6) to Live (Milkdown).
   */
  public async switchSourceToLive(options: {
    sourceText: string;
    sourceOffset: number;
    docState: DocState;
    onDestroySource: () => void;
    onInitLive: (text: string) => Promise<{ pmDoc: any; setCursorPos: (pos: number) => void }>;
  }): Promise<Baseline | null> {
    if (this.isSwitching) return null;

    if (globalImeGuard.composing) {
      return new Promise((resolve) => {
        globalImeGuard.executeOrDefer(async () => {
          const res = await this.switchSourceToLive(options);
          resolve(res);
        });
      });
    }

    this.isSwitching = true;
    try {
      // 1. Destroy CM6 view
      options.onDestroySource();

      // 2. Initialize PM view with sourceText and clean undo history
      const { pmDoc, setCursorPos } = await options.onInitLive(options.sourceText);

      // 3. Rebuild baseline from source text & new PM doc
      const newBaseline = buildBaseline(options.sourceText, pmDoc);

      // 4. Map cursor back to ProseMirror
      const cursorResult = mapSourceToLive(options.sourceOffset, newBaseline, pmDoc);
      setCursorPos(cursorResult.pmPos);

      // 5. Update doc state
      options.docState.mode = 'live';
      if (this.handlers.onStatusMessage) {
        this.handlers.onStatusMessage('已切换到即时渲染模式');
      }

      return newBaseline;
    } catch (err: any) {
      // Chapter 6.3: 解析/插件异常：停留源码模式，状态栏报错
      if (this.handlers.onError) {
        this.handlers.onError(new Error(`无法切回即时渲染模式: ${err?.message || err}`));
      }
      return null;
    } finally {
      this.isSwitching = false;
    }
  }
}
