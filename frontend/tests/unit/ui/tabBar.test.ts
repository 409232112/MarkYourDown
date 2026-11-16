// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import TabBar from '../../../src/components/TabBar.vue';
import { useDocumentsStore } from '../../../src/stores/documents';

describe('document tabs', () => {
  it('allows the final clean document to be closed', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const docs = useDocumentsStore();
    docs.createNewDocument('only.md');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const app = createApp(TabBar).use(pinia);
    app.mount(container);
    try {
      (container.querySelector('.tab-close') as HTMLElement).click();
      await nextTick();
      expect(docs.documents).toHaveLength(0);
      expect(docs.activeDocument).toBeNull();
    } finally {
      app.unmount();
      container.remove();
    }
  });
});
