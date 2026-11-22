const labels:Record<string,string>={listTrash:'Consulta da lixeira',updateAssetRecord:'Plano de edição de registro',updateAssetCategory:'Plano de categoria',renameFolder:'Plano de renomeação de pasta',searchAssets:'Pesquisa de assets',getAssetDetails:'Detalhes do asset',listFolders:'Pesquisa de pastas',listTags:'Etiquetas',getCurrentContext:'Contexto do Convés',getAnalysisResult:'Diagnóstico salvo',analyzeAsset:'Análise técnica',createFolder:'Plano de criação',assignTags:'Plano de etiquetas',removeTags:'Plano de remoção de etiquetas',moveAssetRecord:'Plano de movimentação',moveFolder:'Plano de movimentação de pasta',moveToTrash:'Plano de lixeira',restoreRecord:'Plano de restauração'};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function NautiaToolResults({data}:{data:unknown}){
 const results=Array.isArray(data)?data:[data];
 return <details className="nautia-tool-results"><summary>Detalhes da consulta <span className="nautia-tool-results__count">{results.length}</span></summary>{results.map((raw,i)=>{
  const result=object(raw),payload=object(result.data),rows=Array.isArray(result.data)?result.data:Array.isArray(payload.assets)?payload.assets:[];
  return <section key={i} className="nautia-tool-result"><strong>{labels[String(result.tool)]??'Resultado do RocketBox'}</strong><span className="nautia-tool-result-status">{result.ok===true?'Consulta recebida':result.ok===false?'Falha informada':'Dados retornados'}</span>
    {result.ok===false&&<p>{String(result.summary??'Não foi possível concluir.')}</p>}
    {rows.length>0&&<ul>{rows.slice(0,8).map((row,j)=>{const item=object(row);return <li key={j}>{String(item.virtualPath??item.nome??item.name??item.assetName??`Registro ${j+1}`)}</li>;})}</ul>}
    {rows.length>8&&<p>{rows.length} registros retornados; mostrando os oito primeiros.</p>}
    {Array.isArray(payload.selectedAssetIds)&&<p>{payload.selectedAssetIds.length} asset(s) selecionado(s).</p>}
    {typeof payload.nome==='string'&&<p>{payload.nome}{typeof payload.formato==='string'?` · ${payload.formato}`:''}</p>}
    {result.plan!==undefined&&<p>Proposta preparada. Nenhuma alteração executada por esta consulta.</p>}
    <details className="nautia-technical-data"><summary>Dados técnicos retornados</summary><pre>{JSON.stringify(raw,null,2)}</pre></details>
  </section>;
 })}</details>;
}
