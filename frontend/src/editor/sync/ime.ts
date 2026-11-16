export interface ImeState {
  isComposing: boolean;
  queuedActions: Array<() => void>;
}

export class ImeGuard {
  private isComposing = false;
  private queuedActions: Array<() => void> = [];
  private unbindHandlers: Array<() => void> = [];

  constructor() {}

  public get composing(): boolean {
    return this.isComposing;
  }

  public attach(domElement: HTMLElement): () => void {
    const onCompStart = () => {
      this.isComposing = true;
    };

    const onCompEnd = () => {
      this.isComposing = false;
      this.flushQueue();
    };

    domElement.addEventListener('compositionstart', onCompStart);
    domElement.addEventListener('compositionend', onCompEnd);

    const cleanup = () => {
      domElement.removeEventListener('compositionstart', onCompStart);
      domElement.removeEventListener('compositionend', onCompEnd);
    };

    this.unbindHandlers.push(cleanup);
    return cleanup;
  }

  public executeOrDefer(action: () => void): boolean {
    if (this.isComposing) {
      this.queuedActions.push(action);
      return false; // deferred
    }
    action();
    return true; // executed immediately
  }

  public flushQueue(): void {
    const actions = [...this.queuedActions];
    this.queuedActions = [];
    for (const act of actions) {
      try {
        act();
      } catch (err) {
        console.error('Error executing deferred IME action:', err);
      }
    }
  }

  public shouldBlockInputRule(): boolean {
    return this.isComposing;
  }

  public destroy(): void {
    for (const unbind of this.unbindHandlers) {
      unbind();
    }
    this.unbindHandlers = [];
    this.queuedActions = [];
    this.isComposing = false;
  }
}

export const globalImeGuard = new ImeGuard();
