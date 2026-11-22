/** Identity of the RocketBox assistant, independent of the global OCSIS intelligence. */
export const ROCKETBOX_ASSISTANT = Object.freeze({ id: 'nautia', name: 'Nautia' });

/** Only the former local route is an alias. Other OCSIS identities are not rewritten. */
export function resolveAssistantRoute(route) {
  return route.toLowerCase() === 'synclair' ? ROCKETBOX_ASSISTANT.id : route;
}
