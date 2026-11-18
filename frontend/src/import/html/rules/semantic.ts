import { defaultHandlers } from 'hast-util-to-mdast';
import type { Element } from 'hast';
import type { HtmlHandler } from '../engine/handlers';

// Each enabled standard tag is explicit: new adapters belong in this manifest.
const standardTags = ['applet','area','basefont','bgsound','caption','col','colgroup','command','content','datalist','dialog','element','embed','frame','frameset','isindex','keygen','link','math','menu','menuitem','meta','nextid','noembed','noframes','optgroup','option','param','script','shadow','source','spacer','style','svg','template','title','track','abbr','acronym','bdi','bdo','big','blink','button','canvas','cite','data','details','dfn','font','ins','label','map','marquee','meter','nobr','noscript','object','output','progress','rb','rbc','rp','rt','rtc','ruby','slot','small','span','sup','sub','tbody','tfoot','thead','time','address','article','aside','body','center','div','fieldset','figcaption','figure','form','footer','header','hgroup','html','legend','main','multicol','nav','picture','section','a','audio','b','base','blockquote','br','code','dir','dl','dt','dd','del','em','h1','h2','h3','h4','h5','h6','hr','i','iframe','img','image','input','kbd','li','listing','mark','ol','p','plaintext','pre','q','s','samp','select','strike','strong','summary','table','td','textarea','th','tr','tt','u','ul','var','video','wbr','xmp'] as const;
const standard:HtmlHandler[]=standardTags.map(tag=>{
 if(!(tag in defaultHandlers)) throw new Error(`Missing standard handler: ${tag}`);
 return { id:`standard.${tag}`,version:1,priority:500,phase:'convert',match:(node:Readonly<Element>)=>node.tagName===tag,convert:(_node,ctx)=>({action:'converted',nodes:ctx.standard()}) };
});
const pre:HtmlHandler={id:'standard.pre-preserve',version:1,priority:600,phase:'convert',match:node=>node.tagName==='pre',convert(node){
 const text=(n:typeof node|(typeof node.children)[number]):string=>n.type==='text'?n.value:'children' in n?n.children.map(text).join(''):'';
 const code=node.children.find(ch=>ch.type==='element'&&ch.tagName==='code');
 const classes=code&&code.type==='element'&&Array.isArray(code.properties.className)?code.properties.className:[];
 const lang=classes.map(String).find(name=>name.startsWith('language-'))?.slice(9)||null;
 return {action:'converted',nodes:{type:'code',lang,meta:null,value:text(node)}};
}};
const fallback:HtmlHandler={id:'fallback.children',version:1,priority:0,phase:'convert',match:()=>true,convert:(_node,ctx)=>({action:'converted',nodes:ctx.convertChildren()})};
export const handlers:HtmlHandler[]=[pre,...standard,fallback];
