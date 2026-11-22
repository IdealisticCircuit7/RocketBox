import {memo} from 'react';
import {resolveAssetIcon,type AssetIconInput} from '../../services/assetIconResolver';
import {ASSET_ICON_URLS,fallbackAssetImage} from '../../services/assetIconResources';
import './assetIcon.css';
export const AssetIcon=memo(function AssetIcon({asset,className=''}:{asset:AssetIconInput;className?:string}) {
  const icon=resolveAssetIcon(asset);
  return <span className={`rb-asset-icon ${className}`} role="img" aria-label={icon.accessibleLabel} title={icon.accessibleLabel} data-asset-icon={icon.primary}>
    <img key={icon.primary} className="rb-asset-icon__main" src={ASSET_ICON_URLS[icon.primary]} width="48" height="48" alt="" aria-hidden="true" draggable={false} decoding="async" onError={event=>fallbackAssetImage(event.currentTarget,ASSET_ICON_URLS[icon.fallback])}/>
    {icon.origin&&<img key={icon.origin} className="rb-asset-icon__origin" data-origin-icon={icon.origin} src={ASSET_ICON_URLS[icon.origin]} width="16" height="16" alt="" aria-hidden="true" draggable={false} decoding="async" onError={event=>{event.currentTarget.hidden=true;}}/>}
  </span>;
});
