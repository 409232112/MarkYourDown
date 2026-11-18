import type { Element, ElementContent } from 'hast';
import type { Rule } from '../engine/registry';
const text = (value: string): ElementContent => ({ type:'text', value });
const el = (tagName: string, children: ElementContent[] = []): Element => ({ type:'element', tagName, properties:{}, children });
const prop = (node: Element, key: string) => String(node.properties[key] ?? '');
const issue = (code: string, message: string, impact: 'structure'|'content'|'resource'|'appearance', fallback: 'plain-text'|'row-list'|'link'|'placeholder'|'omit'|'none') => ({ code, message, severity:'warning' as const, impact, fallback });
// A data URL may contain commas, so URL tokens are read separately from descriptors.
function srcsetCandidate(srcset: string): string {
  const candidates: Array<{url:string; width:number}> = [];
  let i = 0;
  while (i < srcset.length) {
    while (i < srcset.length && /[\s,]/.test(srcset[i])) i++;
    const start = i; const data = srcset.slice(i, i + 5).toLowerCase() === 'data:';
    while (i < srcset.length && !/\s/.test(srcset[i]) && (data || srcset[i] !== ',')) i++;
    let url = srcset.slice(start, i);
    // For a data URL without a descriptor the trailing separator is not part of the URL.
    if (data && url.endsWith(',')) url = url.slice(0, -1);
    while (i < srcset.length && /\s/.test(srcset[i])) i++;
    const d = i; while (i < srcset.length && srcset[i] !== ',') i++;
    const descriptor = srcset.slice(d, i).trim();
    if (url) candidates.push({url, width: /^\d+w$/.test(descriptor) ? parseInt(descriptor, 10) : 0});
    i++;
  }
  const withWidths = candidates.filter(x => x.width > 0);
  return (withWidths.length ? withWidths.sort((a,b) => b.width-a.width)[0] : candidates[0])?.url || '';
}
export const rules: Rule[] = [
  { id:'omit.hidden', version:1, priority:1000, match:n => ['script','style','template','noscript'].includes(n.tagName) || 'hidden' in n.properties || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(prop(n,'style')), apply(n,c) { if (n.tagName === 'noscript' && c.text(n).trim()) c.issue(issue('NOSCRIPT_OMITTED','未转换 noscript 内容','content','omit'), n); return null; } },
  { id:'media.unsupported', version:1, priority:900, match:n => ['canvas','svg','math','iframe','video','audio'].includes(n.tagName), apply(n,c) { const value = c.text(n).trim(); const src = prop(n,'src'); c.issue(issue('MEDIA_SIMPLIFIED','嵌入内容或图形无法完整转换','content',value ? 'plain-text' : src ? 'link':'placeholder'), n); if (value) return el('p',[text(value)]); if (src) { const a=el('a',[text(prop(n,'title') || '嵌入内容')]); a.properties.href=c.reference('link',src); return el('p',[a]); } return el('p',[text('［嵌入内容未转换］')]); } },
  { id:'table.caption', version:1, priority:850, match:n => n.tagName === 'table' && n.children.some(ch => ch.type === 'element' && ch.tagName === 'caption'),
    apply(n) { const caption=n.children.find((ch):ch is Element=>ch.type==='element' && ch.tagName==='caption');
      const table:Element={...n, children:n.children.filter(ch=>ch!==caption)};
      return el('div',[el('p',caption?.children || []),table]);
    } },
  { id:'definition.list', version:1, priority:825, match:n=>n.tagName==='dl',
    apply(n) { const children:ElementContent[]=[]; const collect=(x:Element)=>{for(const child of x.children){if(child.type!=='element')continue; if(child.tagName==='dt')children.push(el('p',[el('strong',child.children)])); else if(child.tagName==='dd')children.push(el('blockquote',[el('p',child.children)])); else if(child.tagName==='div')collect(child);}}; collect(n); return el('div',children); } },
  { id:'form.static', version:1, priority:810, match:n=>['input','select','textarea'].includes(n.tagName) && !(n.tagName==='input' && prop(n,'type').toLowerCase()==='checkbox'),
    apply(n,c) { let value=prop(n,'value'); if(n.tagName==='textarea')value=c.text(n); if(n.tagName==='select'){const selected=n.children.find(ch=>ch.type==='element' && ch.tagName==='option' && 'selected' in ch.properties); value=selected?c.text(selected):c.text(n); } c.issue(issue('FORM_SIMPLIFIED','表单控件仅保留静态文字，不能交互','content',value?'plain-text':'omit'),n); return value ? el('span',[text(value)]) : null; } },
  { id:'table.complex', version:1, priority:800, match:n => n.tagName==='table', apply(n,c) { const rows: Element[]=[]; let nested=false; const walk=(x: Element) => { for (const ch of x.children) if (ch.type==='element') { if(ch.tagName==='table') { nested=true; continue; } if(ch.tagName==='tr') rows.push(ch); else walk(ch); } }; walk(n); const cells=rows.map(r=>r.children.filter((x): x is Element=>x.type==='element' && ['td','th'].includes(x.tagName))); const complex=nested || cells.some(row=>row.some(cell=>Number(prop(cell,'rowSpan')||1)>1 || Number(prop(cell,'colSpan')||1)>1 || cell.children.some(ch=>ch.type==='element' && ['p','ul','ol','div','table','br'].includes(ch.tagName)))) || cells.some(r=>r.length!==cells[0]?.length) || rows.filter(r=>r.children.some(x=>x.type==='element' && x.tagName==='th')).length>1;
    if (!complex) { if (cells.length && !cells[0].every(x=>x.tagName==='th')) { const tr=el('tr', cells[0].map(()=>el('th'))); n.children.unshift(el('thead',[tr])); } return n; }
    c.issue(issue('TABLE_SIMPLIFIED','复杂表格已按行转为文字，不能作为等价表格计算','structure','row-list'),n);
    const describe=(node: Element): string => node.children.map(ch=>{
      if(ch.type==='text') return ch.value;
      if(ch.type!=='element') return '';
      if(ch.tagName==='table') {
        const inner:Element[]=[];
        const collectRows=(x:Element) => { for(const part of x.children) if(part.type==='element') { if(part.tagName==='tr') inner.push(part); else if(part.tagName!=='table') collectRows(part); } };
        collectRows(ch);
        return '（嵌套表格：'+inner.map((row,i)=>`第 ${i+1} 行：`+row.children.filter((part):part is Element=>part.type==='element' && (part.tagName==='td'||part.tagName==='th')).map((cell,j)=>`第 ${j+1} 格：${describe(cell).trim()}`).join('；')).join('；')+'）';
      }
      return describe(ch);
    }).join('');
    return el('ul',cells.map((row,i)=>{let column=1; const parts=row.map(cell=>{const position=column; column+=Math.max(1,Number(prop(cell,'colSpan')||1)); return `第 ${position} 格${Number(prop(cell,'colSpan')||1)>1 ? `（跨 ${prop(cell,'colSpan')} 列）`:''}${Number(prop(cell,'rowSpan')||1)>1 ? `（跨 ${prop(cell,'rowSpan')} 行）`:''}：${describe(cell).trim()}`;}); return el('li',[text(`第 ${i+1} 行：`+parts.join('；'))]);})); } },
  { id:'list.explicit-numbers', version:1, priority:750,
    match:n => n.tagName === 'ol' && ('reversed' in n.properties || n.children.some(ch => ch.type === 'element' && ch.tagName === 'li' && 'value' in ch.properties)),
    apply(n,c) {
      const items=n.children.filter((ch):ch is Element=>ch.type==='element' && ch.tagName==='li');
      const reversed='reversed' in n.properties;
      let number=Number(n.properties.start ?? (reversed ? items.length : 1));
      for (const item of items) {
        if ('value' in item.properties) number=Number(item.properties.value);
        item.children.unshift(text(`${number}. `));
        number += reversed ? -1 : 1;
      }
      n.tagName='ul'; delete n.properties.reversed; delete n.properties.start;
      c.issue(issue('LIST_NUMBERING_SIMPLIFIED','非连续或倒序编号已转为显式文字','structure','plain-text'),n);
      return n;
    } },
  { id:'resource.reference',version:1,priority:700,match:n=>n.tagName==='img'||n.tagName==='a',apply(n,c) { const image=n.tagName==='img'; const key=image?'src':'href'; let value=prop(n,key); if(image && !value) { value=prop(n,'dataSrc') || prop(n,'dataOriginal'); if(!value) { const srcset=prop(n,'srcSet'); if(srcset) value=srcsetCandidate(srcset); } if(value) c.issue(issue('IMAGE_SOURCE_FALLBACK','图片使用了备用地址','resource','none'),n); } if(value) n.properties[key]=c.reference(image?'image':'link',value); else if(image) c.issue(issue('IMAGE_MISSING_SOURCE','图片缺少地址','resource','omit'),n); return n; } },
  { id:'style.dropped',version:1,priority:600,match:n=>n.tagName==='u' || !!prop(n,'style'),apply(n,c) { if (n.tagName==='u' || /font-size|text-align|color/i.test(prop(n,'style'))) c.issue(issue('STYLE_DROPPED','部分视觉样式未保留','appearance','none'),n); if(n.tagName==='u') n.tagName='span'; return n; } },
  { id:'details.summary',version:1,priority:500,match:n=>n.tagName==='summary',apply(n) { return el('p',[el('strong',n.children)]); } },
];


// Semantic handlers are explicitly registered alongside normalizers.
export { handlers as semanticHandlers } from './semantic';
