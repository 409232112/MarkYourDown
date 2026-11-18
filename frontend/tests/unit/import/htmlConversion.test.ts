import { describe, it, expect } from 'vitest';
import { convertHTML } from '../../../src/import/html';
const convert=(html:string)=>convertHTML({requestId:'1',html,sourceFileUrl:'file:///C:/docs/source.html'});
describe('HTML conversion',()=>{
 it('converts semantic text and resources',()=>{const r=convert('<h1 id="a">标题</h1><p>Hello <strong>world</strong> &amp; more <a href="#a">go</a></p><img src="a%20b.png" alt="x">');expect(r.status).toBe('complete');if(r.status==='complete'){expect(r.markdown).toContain('# 标题');expect(r.markdown).toContain('**world**');expect(r.markdown).toContain('#标题');expect(r.references.find(x=>x.kind==='image')?.resolved).toBe('file:///C:/docs/a%20b.png');}});
 it('rejects empty and unsupported-only content',()=>{expect(convert('').status).toBe('unsupported');expect(convert('<canvas></canvas>').status).toBe('unsupported');expect(convert('<script>document.write(1)</script>').status).toBe('unsupported');});
 it('reports complex table and retains body',()=>{const r=convert('<p>正文</p><table><tr><td colspan="2">预算</td><td>实际</td></tr></table>');expect(r.status).toBe('degraded');if(r.status==='degraded'){expect(r.markdown).toContain('预算');expect(r.markdown).toContain('正文');expect(r.issues.some(x=>x.code==='TABLE_SIMPLIFIED')).toBe(true);}});
 it('keeps an image-only document',()=>{expect(convert('<img src="x.png">').status).toBe('complete');});
 it('ignores script content and retains code whitespace',()=>{const r=convert('<script>secret</script><pre><code>  a\n  b</code></pre>');expect(r.status).toBe('complete');if(r.status==='complete'){expect(r.markdown).not.toContain('secret');expect(r.markdown).toContain('  a\n  b');}});
});
const c=(html:string)=>convertHTML({requestId:'1',html,sourceFileUrl:'file:///C:/x.html'});
it('converts basic table and checkbox',()=>{const r=c('<table><tr><td>A</td><td>B</td></tr></table><ul><li><input type="checkbox" checked>Task</li></ul>'); expect(r.status).toBe('complete');if(r.status==='complete') {expect(r.markdown).toContain('|');expect(r.markdown).toContain('[x]');}});
it('preserves reversed and explicit list numbering as text',()=>{ const r=c('<ol reversed start="5"><li>五</li><li value="2">二</li><li>一</li></ol>'); expect(r.status).toBe('degraded'); if(r.status==='degraded'){expect(r.markdown).toContain('5\\. 五');expect(r.markdown).toContain('2\\. 二');expect(r.markdown).toContain('1\\. 一');expect(r.issues.some(i=>i.code==='LIST_NUMBERING_SIMPLIFIED')).toBe(true);} });
it('selects a srcset candidate without splitting a data URL',()=>{ const r=c('<img srcset="data:image/png;base64,YWJj 100w, larger.png 200w">'); expect(r.status).toBe('degraded'); if(r.status==='degraded'){expect(r.references[0].resolved).toBe('file:///C:/larger.png');} const d=c('<img srcset="data:image/png;base64,YWJj 200w, smaller.png 100w">'); if(d.status==='degraded'){expect(d.references[0].resolved).toBe('data:image/png;base64,YWJj');} else throw Error('expected degraded'); });
it('retains text of nested tables when degrading',()=>{ const r=c('<table><tr><td>外层<table><tr><td>内一</td><td>内二</td></tr></table>尾部</td></tr></table>');expect(r.status).toBe('degraded');if(r.status==='degraded'){for(const t of ['外层','内一','内二','尾部']) expect(r.markdown).toContain(t);} });
import { convertHTMLWithRules } from '../../../src/import/html/engine/convert';
import { registry, type Rule } from '../../../src/import/html/engine/registry';
const baseInput = { requestId:'rules', html:'<p>一</p><custom>二</custom><p>三</p>', sourceFileUrl:'file:///C:/x.html' };
it('runs rules in stable priority order, discards delegated changes and rejects duplicate ids',()=>{
 const delegate:Rule={id:'test.delegate',version:1,priority:2000,match:n=>n.tagName==='custom',apply(n,c){n.children=[];c.reference('image','ghost.png');return undefined;}};
 const winner:Rule={id:'test.winner',version:1,priority:1900,match:n=>n.tagName==='custom',apply(n){n.tagName='strong';return n;}};
 const result=convertHTMLWithRules(baseInput,[winner,delegate]);
 expect(result.status).toBe('complete'); if(result.status==='complete'){expect(result.markdown).toContain('**二**');expect(result.references).toHaveLength(0);}
 expect(()=>registry([winner,winner])).toThrow('Duplicate rule');
});
it('isolates failing rules and strict mode surfaces the error',()=>{
 const fail:Rule={id:'test.failure',version:1,priority:2000,match:n=>n.tagName==='custom',apply(n,c){c.reference('image','ghost.png');n.children=[];throw new Error('broken rule');}};
 const result=convertHTMLWithRules(baseInput,[fail]);expect(result.status).toBe('degraded');
 if(result.status==='degraded'){expect(result.markdown).toContain('一');expect(result.markdown).toContain('二');expect(result.markdown).toContain('三');expect(result.references).toHaveLength(0);expect(result.issues.some(i=>i.code==='RULE_EXECUTION_FAILED'&&i.ruleId==='test.failure')).toBe(true);}
 expect(convertHTMLWithRules(baseInput,[fail],true).status).toBe('failed');
});
it('retains captions, definition content and static form values',()=>{
 const result=c('<table><caption>销售报告</caption><tr><th>地区</th></tr><tr><td>台北</td></tr></table><dl><dt>术语</dt><dd>释义</dd></dl><p>姓名 <input value="小明"></p>');
 expect(result.status).toBe('degraded');if(result.status==='degraded'){for(const text of ['销售报告','地区','台北','术语','释义','小明'])expect(result.markdown).toContain(text);expect(result.issues.some(i=>i.code==='FORM_SIMPLIFIED')).toBe(true);}
});
it('strips underline rather than turning it into emphasis',()=>{const r=c('<p>前<u>下划线</u>后</p>');expect(r.status).toBe('complete');if(r.status==='complete'){expect(r.markdown).toContain('前下划线后');expect(r.issues.some(i=>i.code==='STYLE_DROPPED')).toBe(true);}});
it('keeps code with HTML-looking text and code fence characters',()=>{
 const r=c('<pre><code class="language-js">const s = "&lt;img src=x&gt;";\n```\n\n</code></pre>');
 expect(r.status).toBe('complete');if(r.status==='complete'){expect(r.markdown).toContain('language-js'.replace('language-',''));expect(r.markdown).toContain('<img src=x>');expect(r.markdown).toContain('```');expect(r.references).toHaveLength(0);}
});
it('retains mixed body and unsupported media while rejecting placeholder only',()=>{
 const mixed=c('<p>可读正文</p><canvas></canvas>');expect(mixed.status).toBe('degraded');if(mixed.status==='degraded'){expect(mixed.markdown).toContain('可读正文');expect(mixed.markdown).toContain('未转换');}
 expect(c('<canvas></canvas>').status).toBe('unsupported');
});
import type { HtmlHandler } from '../../../src/import/html/engine/handlers';
it('uses registered handler priority and rolls back delegated diagnostics and references',()=>{
 const delegate:HtmlHandler={id:'adapter.delegate',version:1,priority:3000,phase:'convert',match:n=>n.tagName==='custom',convert(_n,ctx){ctx.registerReference('image','ghost.png');ctx.reportIssue({code:'GHOST',severity:'warning',impact:'content',message:'ghost',fallback:'omit'});return {action:'delegate'};}};
 const adapter:HtmlHandler={id:'adapter.custom',version:1,priority:2000,phase:'convert',match:n=>n.tagName==='custom',convert(_n,ctx){return {action:'converted',nodes:{type:'strong',children:ctx.convertChildren() as import('mdast').PhrasingContent[]}};}};
 const r=convertHTMLWithRules(baseInput,[],false,[adapter,delegate]);expect(r.status).toBe('complete');if(r.status==='complete'){expect(r.markdown).toContain('**二**');expect(r.references).toHaveLength(0);expect(r.issues).toHaveLength(0);}
 const noMatch=convertHTMLWithRules({...baseInput,html:'<p>反例</p>'},[],false,[adapter]);expect(noMatch.status).toBe('complete');if(noMatch.status==='complete')expect(noMatch.markdown).toBe('反例\n');
 expect(()=>convertHTMLWithRules(baseInput,[],false,[adapter,adapter])).toThrow('Duplicate rule');
});
it('isolates handler failures, rejects ghost references, and strict mode fails',()=>{
 const broken:HtmlHandler={id:'adapter.broken',version:1,priority:3000,phase:'convert',match:n=>n.tagName==='custom',convert(_n,ctx){ctx.registerReference('image','ghost.png');ctx.reportIssue({code:'GHOST',severity:'warning',impact:'content',message:'ghost',fallback:'omit'});throw Error('test failure');}};
 const r=convertHTMLWithRules(baseInput,[],false,[broken]);expect(r.status).toBe('degraded');if(r.status==='degraded'){expect(r.markdown).toContain('一');expect(r.markdown).toContain('二');expect(r.markdown).toContain('三');expect(r.references).toHaveLength(0);expect(r.issues.map(i=>i.code)).toEqual(['RULE_EXECUTION_FAILED']);expect(r.issues[0].ruleId).toBe('adapter.broken');}
 expect(convertHTMLWithRules(baseInput,[],true,[broken]).status).toBe('failed');
});
it('changes fingerprint when a registered handler version changes',()=>{
 const rule:HtmlHandler={id:'adapter.versioned',version:1,priority:700,phase:'convert',match:()=>false,convert:()=>({action:'delegate'})};
 const a=convertHTMLWithRules(baseInput,[],false,[rule]);const b=convertHTMLWithRules(baseInput,[],false,[{...rule,version:2}]);if(a.status==='complete'&&b.status==='complete')expect(a.summary.ruleSetFingerprint).not.toEqual(b.summary.ruleSetFingerprint);else throw Error('unexpected result');
});
