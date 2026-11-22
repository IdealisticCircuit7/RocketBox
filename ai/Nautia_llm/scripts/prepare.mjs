import { readFileSync, writeFileSync } from 'node:fs';
import { renderModelfile } from '../runtime/foundation.ts';
const read = name => readFileSync(new URL(`../prompts/${name}.md`,import.meta.url),'utf8');
const bundle={identity:read('identity'),conversation:read('conversation'),intent:read('intent'),persona:read('persona')};
if(process.argv.includes('--write')) {
  const writeChanged=(name,text)=>{const url=new URL(name,import.meta.url);let current;try{current=readFileSync(url,'utf8');}catch{}if(current!==text)writeFileSync(url,text);};
  writeChanged('../runtime/promptBundle.json',JSON.stringify(bundle,null,2)+'\n');
  writeChanged('../Modelfile',renderModelfile(bundle.identity,bundle.conversation,bundle.persona));
} else process.stdout.write(process.argv.includes('--bundle')?JSON.stringify(bundle,null,2):renderModelfile(bundle.identity,bundle.conversation,bundle.persona));
