import { it, expect, vi } from 'vitest';
import { convertHTMLAsync } from '../../../src/import/html/client';

const input = {requestId:'w',html:'<p>离线预览</p>',sourceFileUrl:'file:///C:/a.html'};
it('falls back for small documents when Worker is unavailable', async()=>{
 vi.stubGlobal('Worker',undefined);
 try { const result=await convertHTMLAsync(input); expect(result.status).toBe('complete'); if(result.status==='complete')expect(result.markdown).toContain('离线预览'); }
 finally { vi.unstubAllGlobals(); }
});
it('honours cancellation before a scheduled fallback', async()=>{
 vi.stubGlobal('Worker',undefined);
 try { const controller=new AbortController(); const pending=convertHTMLAsync(input,controller.signal); controller.abort(); await expect(pending).rejects.toMatchObject({name:'AbortError'}); }
 finally { vi.unstubAllGlobals(); }
});
it('refuses a large synchronous fallback', async()=>{
 vi.stubGlobal('Worker',undefined);
 try { const result=await convertHTMLAsync({...input,html:'a'.repeat(1024*1024+1)});expect(result.status).toBe('failed');if(result.status==='failed')expect(result.error.code).toBe('WORKER_ERROR'); }
 finally { vi.unstubAllGlobals(); }
});
