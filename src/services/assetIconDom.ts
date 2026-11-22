import {resolveAssetIcon,type AssetIconInput} from './assetIconResolver';
import {ASSET_ICON_URLS,fallbackAssetImage} from './assetIconResources';
import '../components/common/assetIcon.css';
/** Legacy DOM library uses the same decisions and resources as React. */
export function createAssetIconElement(asset:AssetIconInput) {
  const icon=resolveAssetIcon(asset),host=document.createElement('span');
  host.className='rb-asset-icon';host.dataset.assetIcon=icon.primary;host.role='img';
  host.setAttribute('aria-label',icon.accessibleLabel);host.title=icon.accessibleLabel;
  const main=document.createElement('img');main.className='rb-asset-icon__main';main.src=ASSET_ICON_URLS[icon.primary];
  main.alt='';main.draggable=false;main.width=main.height=48;main.decoding='async';
  main.onerror=()=>fallbackAssetImage(main,ASSET_ICON_URLS[icon.fallback]);host.append(main);
  if(icon.origin){const badge=document.createElement('img');badge.className='rb-asset-icon__origin';badge.dataset.originIcon=icon.origin;
    badge.src=ASSET_ICON_URLS[icon.origin];badge.alt='';badge.draggable=false;badge.width=badge.height=16;
    badge.onerror=()=>{badge.hidden=true;};host.append(badge);}
  return host;
}
