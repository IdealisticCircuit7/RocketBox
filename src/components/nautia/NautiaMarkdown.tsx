import {createElement,useMemo} from 'react';
import {markdownInline,parseNautiaMarkdown} from '../../services/nautiaMarkdown';
function inline(text:string){return markdownInline(text).map((part,i)=>part.kind==='text'?part.text:part.kind==='link'?<a key={i} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>:createElement(part.kind==='strong'?'strong':part.kind==='em'?'em':'code',{key:i},part.text));}
export function NautiaMarkdown({text}:{text:string}){
 const blocks=useMemo(()=>parseNautiaMarkdown(text),[text]);
 return <div className="nautia-markdown">{blocks.map((block,i)=>{
  if(block.kind==='code')return <pre key={i}><code>{block.text}</code></pre>;
  if(block.kind==='rule')return <hr key={i}/>;
  if(block.kind==='heading')return createElement(`h${Math.min(6,(block.level??1)+2)}`,{key:i},inline(block.text??''));
  if(block.kind==='quote')return <blockquote key={i}>{inline(block.text??'')}</blockquote>;
  if(block.kind==='ul'||block.kind==='ol')return createElement(block.kind,{key:i},block.items?.map((item,j)=><li key={j}>{inline(item)}</li>));
  if(block.kind==='table')return <div className="nautia-markdown-table" key={i}><table><thead><tr>{block.rows?.[0].map((cell,j)=><th key={j}>{inline(cell)}</th>)}</tr></thead><tbody>{block.rows?.slice(1).map((row,j)=><tr key={j}>{row.map((cell,k)=><td key={k}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
  return <p key={i}>{inline(block.text??'')}</p>;
 })}</div>;
}
