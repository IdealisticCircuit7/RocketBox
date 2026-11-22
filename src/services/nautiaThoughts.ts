export type NautiaThoughtCategory='generic'|'search'|'organization';
const phrases:Record<NautiaThoughtCategory,readonly string[]>={
  generic:['Interessante… 🤔','Um instante… 💭','Deixa eu ver…'],
  search:['Hmm… 🔎','Vamos procurar…','Por onde começar? 🤔'],
  organization:['Organizando as ideias… 📂','Deixa eu pensar…','Hmm… 🧠'],
};
// Categories come from an explicit mode or a validated tool. No prompt is echoed or classified here.
export function thoughtCategoryForTool(name:string):NautiaThoughtCategory {
  if(['searchAssets','getAssetDetails','listFolders','listTags'].includes(name))return 'search';
  if(['createFolder','assignTags','removeTags','moveAssetRecord','moveFolder','moveToTrash','restoreRecord'].includes(name))return 'organization';
  return 'generic';
}
export function nautiaThought(category:NautiaThoughtCategory,index:number){return phrases[category][index%phrases[category].length];}
