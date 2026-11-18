import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import GithubSlugger from 'github-slugger';
import type { Element, Nodes, Root, RootContent } from 'hast';
import type { ConvertInput, ConversionResult, HtmlReference, Issue } from '../contracts';
import { registry, type Rule } from './registry';
import { rules, semanticHandlers } from '../rules/manifest';
import { createSemanticDispatch, handlerRegistry, type HtmlHandler } from './handlers';
const parser=unified().use(rehypeParse);
const serializer=unified().use(remarkGfm).use(remarkStringify,{bullet:'-',fences:true});
const contentText=(node:Nodes):string=>node.type==='text'?node.value:'children' in node?node.children.map(n=>contentText(n as Nodes)).join(''):'';
export function convertHTML(input:ConvertInput):ConversionResult {
 return convertHTMLWithRules(input, []);
}
// Injection is for engine tests and compile-time presets, never user-supplied code.
export function convertHTMLWithRules(input:ConvertInput, extraRules: Rule[], strict = false, extraHandlers:HtmlHandler[] = []):ConversionResult {
 const ordered=registry([...rules,...extraRules]);
 const handlerRules=handlerRegistry([...semanticHandlers,...extraHandlers]);
 const ids=new Set(ordered.map(rule=>rule.id));
 for(const rule of handlerRules)if(ids.has(rule.id))throw new Error(`Duplicate rule: ${rule.id}`);
 const fingerprint=[...ordered,...handlerRules].map(r=>`${r.id}:${r.version}:${r.priority}`).join('|');
 const fail=(code:string,message:string):ConversionResult=>({status:'failed',requestId:input.requestId,error:{code,message,retryable:true}});
 try {
  if(new TextEncoder().encode(input.html).byteLength>40*1024*1024)return fail('INPUT_TOO_LARGE','HTML 内容超过大小限制');
  const root=parser.parse(input.html) as Root;
  let count=0; const stack:Array<{node:Nodes,depth:number}>=[{node:root,depth:0}];
  while(stack.length){const {node,depth}=stack.pop()!;if(++count>100000||depth>256)return fail('LIMIT_EXCEEDED','HTML 结构超过转换限制');if('children' in node)for(const ch of node.children)stack.push({node:ch as Nodes,depth:depth+1});}
  const find=(n:Nodes,tag:string):Element|undefined=>{if(n.type==='element'&&n.tagName===tag)return n;if('children' in n)for(const ch of n.children){const found=find(ch as Nodes,tag);if(found)return found;}};
  const titleNode=find(root,'title');const title=titleNode?contentText(titleNode).trim():undefined;const body=find(root,'body');const base=find(root,'base');let baseUrl=input.sourceFileUrl;try{if(base?.properties.href)baseUrl=new URL(String(base.properties.href),baseUrl).href;}catch{}
  const issues:Issue[]=[];const references:HtmlReference[]=[];let meaningful=0,images=0,unsupportedBlocks=0;
  const slugger=new GithubSlugger();const anchors=new Map<string,string>();
  const collect=(n:Nodes)=>{if(n.type==='element'&&/^h[1-6]$/.test(n.tagName)){const slug=slugger.slug(contentText(n));if(n.properties.id)anchors.set(String(n.properties.id),slug);}if('children' in n)n.children.forEach(ch=>collect(ch as Nodes));};if(body)collect(body);
  const walk=(node:RootContent):RootContent|null=>{
   if(node.type==='text'){meaningful+=node.value.trim().length;return node;}if(node.type!=='element')return null;
   let result:Element|null=node;
   for(const rule of ordered){if(!rule.match(result))continue;const stagedIssues:Issue[]=[];const stagedRefs:HtmlReference[]=[];
    const context={text:contentText,issue:(issue:Omit<Issue,'ruleId'|'ruleVersion'>,n:Element)=>stagedIssues.push({...issue,ruleId:rule.id,ruleVersion:rule.version,source:n.position?.start?{line:n.position.start.line,column:n.position.start.column}:undefined}),reference:(kind:'image'|'link',original:string)=>{let resolved=original;if(original.startsWith('#')&&kind==='link'&&anchors.has(original.slice(1)))resolved='#'+anchors.get(original.slice(1));else{try{resolved=new URL(original,baseUrl).href;}catch{stagedIssues.push({code:'INVALID_REFERENCE',severity:'warning',impact:'resource',message:'资源地址无效',fallback:'none',ruleId:rule.id,ruleVersion:rule.version});}if(original.startsWith('#')&&kind==='link')stagedIssues.push({code:'ANCHOR_NOT_MAPPED',severity:'warning',impact:'structure',message:'非标题锚点保留为源文件地址',fallback:'link',ruleId:rule.id,ruleVersion:rule.version});}const state=resolved.startsWith('file:')||resolved.startsWith('data:')||resolved.startsWith('#')?'available':/^https?:/i.test(resolved)?'remote':'unsupported';stagedRefs.push({id:`ref-${references.length+stagedRefs.length+1}`,kind,original,resolved,state});return resolved;}};
    try{const outcome=rule.apply(structuredClone(result),context);if(outcome===undefined)continue;issues.push(...stagedIssues);references.push(...stagedRefs);result=outcome;break;}catch(error){if(strict)throw error;issues.push({code:'RULE_EXECUTION_FAILED',severity:'warning',impact:'content',message:`转换规则 ${rule.id} 失败，已保留纯文本`,fallback:'plain-text',ruleId:rule.id,ruleVersion:rule.version});result={type:'element',tagName:'p',properties:{},children:[{type:'text',value:contentText(node)}]};break;}
   }
   if(!result)return null;if(['canvas','svg','math','iframe','video','audio'].includes(node.tagName)){unsupportedBlocks++;if(contentText(node).trim())meaningful+=contentText(node).trim().length;return result;}
   if(result.tagName==='pre'){meaningful+=contentText(result).trim().length;return result;}
   if(result.tagName==='img'&&result.properties.src)images++;result.children=result.children.map(ch=>walk(ch)).filter((ch):ch is RootContent=>ch!==null) as Element['children'];return result;
  };
  const cleaned:Root={type:'root',children:(body?.children??[]).map(ch=>walk(ch)).filter((ch):ch is RootContent=>ch!==null)};
  const getSummary=()=>({converterVersion:input.converterVersion||'html-v1',ruleSetVersion:'1',ruleSetFingerprint:fingerprint,meaningfulTextChars:meaningful,retainedImageCount:images,degradedBlockCount:issues.filter(i=>i.severity!=='info'&&i.impact!=='appearance').length,omittedContentBlockCount:issues.filter(i=>i.fallback==='omit'&&i.impact==='content').length});
  if(!meaningful&&!images)return{status:'unsupported',requestId:input.requestId,reason:!input.html.trim()?'EMPTY_DOCUMENT':unsupportedBlocks?'ONLY_UNSUPPORTED_CONTENT':'NO_STATIC_CONTENT',issues,summary:getSummary()};
  const tags = new Set<string>();
  const gather=(n:Nodes)=>{if(n.type==='element')tags.add(n.tagName);if('children' in n)n.children.forEach(ch=>gather(ch as Nodes));};gather(cleaned);
  const converter=unified().use(rehypeRemark,{handlers:createSemanticDispatch(tags,handlerRules,{
   issues,references,
   reference:(kind,original)=>{let resolved=original;try{resolved=new URL(original,baseUrl).href;}catch{};return {kind,original,resolved,state:resolved.startsWith('file:')||resolved.startsWith('data:')?'available':/^https?:/i.test(resolved)?'remote':'unsupported'};},
   onFailure:(rule,node,error)=>{if(strict)throw error;issues.push({code:'RULE_EXECUTION_FAILED',severity:'warning',impact:'content',message:`转换规则 ${rule.id} 失败，已保留纯文本`,fallback:'plain-text',ruleId:rule.id,ruleVersion:rule.version,source:node.position?.start?{line:node.position.start.line,column:node.position.start.column}:undefined});}
  })});
  const mdast=converter.runSync(cleaned);const markdown=String(serializer.stringify(mdast)).replace(/\r\n?/g,'\n').replace(/\n*$/,'\n');
  return{status:issues.some(i=>i.severity!=='info'&&i.impact!=='appearance')?'degraded':'complete',requestId:input.requestId,markdown,title,references,issues,summary:getSummary()};
 }catch(e){return fail('CONVERSION_FAILED',e instanceof Error?e.message:'转换失败');}
}
