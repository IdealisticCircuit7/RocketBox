/** Local engineering rules: no claim of successful engine import. Increment on semantic changes. */
export const RULESET_VERSION = 'rocketbox-technical-1.0.0';
export const TECHNICAL_RULES = [
  { id: 'CONTENT_HEADER', version: 1, format: '*', resourceType: '*', sourceSoftware: '*', targetSoftware: '*', softwareVersion: null, origin: 'RocketBox bounded header inspector', limitation: 'Header validation does not prove complete file integrity.' },
  { id: 'PROJECT_MARKERS', version: 1, format: 'directory', resourceType: 'project', sourceSoftware: 'Unity', targetSoftware: '*', softwareVersion: null, origin: 'RocketBox project marker policy: Assets, Packages, ProjectSettings', limitation: 'Does not inspect dependencies or import a project.' },
  { id: 'RULE_UE5_BLEND_EXPORT', version: 1, format: '.blend', resourceType: '*', sourceSoftware: 'Blender', targetSoftware: 'Unreal Engine 5', softwareVersion: '5 (minor unspecified)', origin: 'RocketBox existing deterministic rule', limitation: 'Intermediate export required; export/import not tested.' },
  { id: 'RULE_ENGINE_UNITY_COMPATIBILITY', version: 1, format: '.uasset/.uproject', resourceType: '*', sourceSoftware: 'Unreal', targetSoftware: 'Unity', softwareVersion: null, origin: 'RocketBox existing deterministic rule', limitation: 'Direct format rejection only; does not inspect source export alternatives.' },
] as const;
