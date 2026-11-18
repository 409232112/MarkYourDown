import type { ConvertInput, ConversionResult } from './contracts';
import { convertHTML } from './engine/convert';
import InlineHtmlWorker from './worker?worker&inline';

let active = 0;
const queue: Array<() => void> = [];
function next() { while (active < 2 && queue.length) queue.shift()!(); }

export function convertHTMLAsync(input: ConvertInput, signal?: AbortSignal): Promise<ConversionResult> {
 return new Promise((resolve, reject) => {
  let worker: Worker | undefined;
  let finished = false, running = false, attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deferred: ReturnType<typeof setTimeout> | undefined;
  const finish = (result?: ConversionResult, error?: Error) => {
   if (finished) return;
   finished = true;
   if (timer) clearTimeout(timer);
   if (deferred) clearTimeout(deferred);
   signal?.removeEventListener('abort', abort);
   worker?.terminate();
   if (running) active--;
   if (error) reject(error); else resolve(result!);
   next();
  };
  const abort = () => finish(undefined, new DOMException('Conversion cancelled', 'AbortError'));
  if (signal?.aborted) { abort(); return; }
  signal?.addEventListener('abort', abort, { once: true });
  const fallback = () => {
   worker?.terminate(); worker = undefined;
   if (finished) return;
   // The fallback is intentionally bounded: a very large synchronous parse
   // cannot be interrupted in a WebView without a working Worker.
   if (new TextEncoder().encode(input.html).byteLength > 1024 * 1024) {
    finish({status:'failed', requestId:input.requestId, error:{code:'WORKER_ERROR', message:'转换进程不可用，文件过大无法安全地在主线程转换', retryable:true}});
    return;
   }
   deferred = setTimeout(() => {
    if (finished) return;
    try { finish(convertHTML(input)); } catch (e) { finish(undefined, e as Error); }
   }, 0);
  };
  const startWorker = () => {
   if (finished) return;
   try {
    if (attempt === 0) worker = new InlineHtmlWorker();
    else worker = new Worker(new URL('./worker.ts', import.meta.url), { type:'module' });
    worker.onmessage = (e: MessageEvent<ConversionResult>) => finish(e.data);
    worker.onerror = (event) => {
     event.preventDefault?.();
     worker?.terminate(); worker = undefined;
     if (attempt++ === 0) startWorker(); else fallback();
    };
    worker.postMessage(input);
   } catch {
    worker?.terminate(); worker = undefined;
    if (attempt++ === 0 && typeof Worker !== 'undefined') startWorker(); else fallback();
   }
  };
  queue.push(() => {
   if (finished) return;
   running = true; active++;
   timer = setTimeout(() => finish({status:'failed', requestId:input.requestId, error:{code:'TIMEOUT', message:'HTML 转换超时', retryable:true}}), 15000);
   if (typeof Worker === 'undefined') fallback(); else startWorker();
  });
  next();
 });
}
