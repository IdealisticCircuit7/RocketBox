import {readFileSync,writeFileSync} from 'node:fs';
import {interpretNautiaIntent} from '../../../src/services/nautiaIntentService.ts';
import {listOllamaModels} from '../../../src/services/ollamaClient.ts';
import {nautiaConfig} from '../runtime/foundation.ts';
const cases=JSON.parse(readFileSync(new URL('../evaluations/conversation-cases.json',import.meta.url),'utf8'));
const models=await listOllamaModels(nautiaConfig.endpoint,fetch);
const model=process.env.NAUTIA_EVAL_MODEL??nautiaConfig.modelName;
if(!models.includes(model))throw new Error(`Modelo local ausente: ${model}`);
const normalize=value=>String(value).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const results=[];const started=new Date().toISOString();
for(const item of cases){
  const start=Date.now();let actual=null;let checks={};let error;
  try {
    actual=await interpretNautiaIntent(item.prompt,item.history??[],item.context??{},AbortSignal.timeout(90000),fetch,model);
    for(const [key,value] of Object.entries(item.expected)){
      checks[key]=key==='entities'?Object.entries(value).every(([field,text])=>actual.entities[field]!==null&&normalize(actual.entities[field]).includes(normalize(text))):actual[key]===value;
    }
  }catch(e){error=String(e);checks.schema=false;}
  const result={id:item.id,group:item.group,expected:item.expected,actual,checks,passed:Object.values(checks).every(Boolean),error,durationMs:Date.now()-start,actionsExecuted:0};
  results.push(result);console.log(`${item.id} ${result.passed?'PASS':'FAIL'} ${item.group} ${JSON.stringify(actual)}`);
  // Generated evaluation artifact, never product/library data.
  writeFileSync(new URL(process.env.NAUTIA_EVAL_OUTPUT??'../evaluations/results.json',import.meta.url),JSON.stringify({started,updatedAt:new Date().toISOString(),model,baseModel:nautiaConfig.baseModel,configuration:{temperature:0,numCtx:nautiaConfig.numCtx},total:cases.length,completed:results.length,passed:results.filter(x=>x.passed).length,results},null,2)+'\n');
}
console.log(`Resultado: ${results.filter(r=>r.passed).length}/${cases.length}. Classificador apenas: nenhuma operação executada.`);
if(results.some(r=>!r.passed))process.exitCode=1;
