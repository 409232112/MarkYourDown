import { defaultHandlers } from 'hast-util-to-mdast';
import type { Handle, State } from 'hast-util-to-mdast';
import type { Element, Parents } from 'hast';
import type { Nodes as MarkdownNode } from 'mdast';
import type { HtmlReference, Issue } from '../contracts';

export type HandlerOutcome =
  | { action: 'converted' | 'degraded'; nodes: MarkdownNode | MarkdownNode[] | undefined }
  | { action: 'omit' | 'delegate' };
export interface HandlerContext {
  convertChildren(): MarkdownNode[];
  standard(): MarkdownNode | MarkdownNode[] | undefined;
  reportIssue(issue: Omit<Issue, 'ruleId' | 'ruleVersion'>): void;
  registerReference(kind:'image'|'link', original:string): string;
}
export interface HtmlHandler {
  id: string; version: number; priority: number; phase: 'convert';
  match(node: Readonly<Element>): boolean;
  convert(node: Readonly<Element>, ctx: HandlerContext): HandlerOutcome;
}
export function handlerRegistry(rules: HtmlHandler[]): HtmlHandler[] {
 const ids=new Set<string>();
 for(const rule of rules) {
  if(ids.has(rule.id)) throw new Error(`Duplicate rule: ${rule.id}`);
  if(rule.phase !== 'convert' || !rule.id || !Number.isFinite(rule.priority) || !Number.isInteger(rule.version) || rule.version<1) throw new Error(`Invalid handler: ${rule.id}`);
  ids.add(rule.id);
 }
 return [...rules].sort((a,b)=>b.priority-a.priority || (a.id<b.id?-1:a.id>b.id?1:0));
}
export function createSemanticDispatch(tags: Set<string>, rules: HtmlHandler[], options: {
 issues: Issue[]; references: HtmlReference[];
 reference: (kind:'image'|'link', original:string) => Omit<HtmlReference,'id'>;
 onFailure: (rule:HtmlHandler,node:Element,error:unknown)=>void;
}): Record<string, Handle> {
 const handlers:Record<string,Handle>={};
 for(const tag of tags) handlers[tag]=(state:State,node:Element,parent:Parents|undefined)=>{
  for(const rule of rules){
   const issueStart=options.issues.length, referenceStart=options.references.length;
   try {
    if(!rule.match(node)) continue;
    const standard=defaultHandlers[node.tagName as keyof typeof defaultHandlers] as Handle|undefined;
    const result=rule.convert(structuredClone(node),{
     convertChildren:()=>state.all(node),
     standard:()=>standard ? standard(state,node,parent)||undefined : undefined,
     reportIssue:issue=>options.issues.push({...issue,ruleId:rule.id,ruleVersion:rule.version,source:issue.source || (node.position?.start?{line:node.position.start.line,column:node.position.start.column}:undefined)}),
     registerReference:(kind,original)=>{const ref=options.reference(kind,original);options.references.push({...ref,id:`ref-${options.references.length+1}`});return ref.resolved;},
    });
    if(result.action==='delegate'){options.issues.length=issueStart;options.references.length=referenceStart;continue;}
    if(result.action==='omit'){
     if(options.issues.length===issueStart)throw new Error(`Handler ${rule.id} omitted content without a diagnostic`);
     return undefined;
    }
    if(result.action==='degraded' && options.issues.length===issueStart) throw new Error(`Handler ${rule.id} degraded content without a diagnostic`);
    return 'nodes' in result ? result.nodes : undefined;
   } catch(error){
    options.issues.length=issueStart;options.references.length=referenceStart;
    if(rule.id==='fallback.children')throw error;
    options.onFailure(rule,node,error);
    const getText=(n:Element|Element['children'][number]):string=>n.type==='text'?n.value:'children' in n?n.children.map(getText).join(''):'';
    return {type:'text',value:getText(node)};
   }
  }
  throw new Error(`No conversion handler for ${node.tagName}`);
 };
 return handlers;
}
