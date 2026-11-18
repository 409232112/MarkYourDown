// @vitest-environment happy-dom
import { it, expect, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import EditorHost from '../../../src/components/EditorHost.vue';
import { useDocumentsStore } from '../../../src/stores/documents';
import { useSettingsStore } from '../../../src/stores/settings';
vi.mock('../../../src/api', () => ({ fileApi: { addRecentFile: vi.fn(), saveFile: vi.fn(async () => ({success:true,hash:'saved',mtimeMs:1,size:1})) }, backupApi: {removeBackup:vi.fn(),saveBackup:vi.fn()} }));
const settle = async () => { for(let i=0;i<12;i++) await nextTick(); };
it('keeps source history and selection across tabs and replaces using current positions', async () => {
 vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});
 const pinia=createPinia();setActivePinia(pinia);
 const docs=useDocumentsStore();useSettingsStore().settings.autoSave=false;
 const a=docs.createNewDocument('a','abc');docs.activeDocument!.mode='source';
 const root=document.createElement('div');document.body.append(root);
 const app=createApp(EditorHost);app.use(pinia);app.mount(root);await settle();
 const cm=()=>EditorView.findFromDOM(root.querySelector('.cm-editor') as HTMLElement)!;
 cm().dispatch({changes:{from:3,insert:'!'},selection:{anchor:2}});
 const first=cm();
 docs.createNewDocument('b','other');docs.activeDocument!.mode='source';await settle();
 docs.switchDocument(a.id);await settle();
 expect(cm()).toBe(first);expect(cm().state.selection.main.head).toBe(2);
 expect(undo(cm())).toBe(true);expect(cm().state.doc.toString()).toBe('abc');
 window.dispatchEvent(new CustomEvent('editor:find-query',{detail:{query:'abc',matchCase:false}}));
 cm().dispatch({changes:{from:0,insert:'prefix '}});
 window.dispatchEvent(new CustomEvent('editor:replace',{detail:{query:'abc',replacement:'XYZ',matchCase:false}}));
 expect(cm().state.doc.toString()).toBe('prefix XYZ');
 app.unmount();root.remove();
});

it('saves edits in both tabs when their independent timers expire', async () => {
 vi.useFakeTimers();vi.spyOn(EditorView.prototype,'focus').mockImplementation(()=>{});
 const pinia=createPinia();setActivePinia(pinia);const docs=useDocumentsStore();
 const settings=useSettingsStore();settings.settings.autoSave=true;settings.settings.autoSaveInterval=1;
 const a=docs.createNewDocument('a','one');docs.activeDocument!.path='C:/a.md';docs.activeDocument!.mode='source';
 const root=document.createElement('div');document.body.append(root);const app=createApp(EditorHost);app.use(pinia);app.mount(root);await settle();
 const cm=()=>EditorView.findFromDOM(root.querySelector('.cm-editor') as HTMLElement)!;
 cm().dispatch({changes:{from:3,insert:'!'}});
 const b=docs.createNewDocument('b','two');docs.activeDocument!.path='C:/b.md';docs.activeDocument!.mode='source';await settle();
 cm().dispatch({changes:{from:3,insert:'!'}});
 await vi.advanceTimersByTimeAsync(1000);
 expect(docs.documents.find(d=>d.id===a.id)?.status).toBe('clean');
 expect(docs.documents.find(d=>d.id===b.id)?.status).toBe('clean');
 app.unmount();root.remove();vi.useRealTimers();
});
