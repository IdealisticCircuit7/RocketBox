export type MarkdownBlock={kind:'paragraph'|'heading'|'quote'|'code'|'ul'|'ol'|'table'|'rule';text?:string;level?:number;items?:string[];rows?:string[][];};
export type MarkdownInline={kind:'text'|'code'|'strong'|'em'|'link';text:string;href?:string;};
export function markdownInline(text:string):MarkdownInline[]{
 const parts:MarkdownInline[]=[];let position=0;
 for(const match of text.matchAll(/`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\)/g)){
  const index=match.index??0;if(index>position)parts.push({kind:'text',text:text.slice(position,index)});
  const value=match[0];
  if(value.startsWith('`'))parts.push({kind:'code',text:value.slice(1,-1)});
  else if(value.startsWith('**')||value.startsWith('__'))parts.push({kind:'strong',text:value.slice(2,-2)});
  else if(value.startsWith('*'))parts.push({kind:'em',text:value.slice(1,-1)});
  else {const link=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(value)!;let href:string|undefined;try{const url=new URL(link[2]);if(['http:','https:'].includes(url.protocol))href=url.href;}catch{}parts.push(href?{kind:'link',text:link[1],href}:{kind:'text',text:value});}
  position=index+value.length;
 }
 if(position<text.length)parts.push({kind:'text',text:text.slice(position)});
 return parts;
}
/** A small explicit Markdown subset. Raw HTML is always text, never inserted into the DOM. */
export function parseNautiaMarkdown(text:string):MarkdownBlock[]{
 const lines=text.replace(/\r\n/g,'\n').split('\n'),blocks:MarkdownBlock[]=[];
 const special=(line:string)=>/^\s*(?:```|#{1,6}\s|>\s?|[-*+]\s|\d+\.\s|---+\s*$)/.test(line);
 const row=(line:string)=>line.trim().replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim());
 for(let i=0;i<lines.length;){
  const line=lines[i];if(!line.trim()){i++;continue;}
  if(/^\s*```/.test(line)){const code:string[]=[];i++;while(i<lines.length&&!/^\s*```/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;blocks.push({kind:'code',text:code.join('\n')});continue;}
  const heading=/^\s*(#{1,6})\s+(.+)$/.exec(line);if(heading){blocks.push({kind:'heading',level:heading[1].length,text:heading[2]});i++;continue;}
  if(/^\s*---+\s*$/.test(line)){blocks.push({kind:'rule'});i++;continue;}
  if(line.includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])){const rows=[row(line)];i+=2;while(i<lines.length&&lines[i].includes('|')&&lines[i].trim())rows.push(row(lines[i++]));blocks.push({kind:'table',rows});continue;}
  if(/^\s*>/.test(line)){const quote:string[]=[];while(i<lines.length&&/^\s*>/.test(lines[i]))quote.push(lines[i++].replace(/^\s*>\s?/,''));blocks.push({kind:'quote',text:quote.join('\n')});continue;}
  const list=/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(line);
  if(list){const ordered=!!list[2],items:string[]=[];while(i<lines.length){const item=/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(lines[i]);if(!item||!!item[2]!==ordered)break;items.push(item[3]);i++;}blocks.push({kind:ordered?'ol':'ul',items});continue;}
  const paragraph=[line];i++;while(i<lines.length&&lines[i].trim()&&!special(lines[i])&&!(lines[i].includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]??'')))paragraph.push(lines[i++]);blocks.push({kind:'paragraph',text:paragraph.join('\n')});
 }
 return blocks;
}
