import { convertHTML } from './engine/convert';
import type { ConvertInput } from './contracts';
self.onmessage=(event:MessageEvent<ConvertInput>)=>self.postMessage(convertHTML(event.data));
