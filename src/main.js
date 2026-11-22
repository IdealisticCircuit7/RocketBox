import { initializeCinematic, setCinematicView } from "./cinematic.js";
import { mountIcons } from "./icons.js";
import { createWorkspaceStore, WORKSPACE_KEY } from "./workspace-store.js";
import { initializeLibrary } from "./library-ui.js";
import { createPreferencesService, PREFERENCES_KEY } from "./preferences.ts";
import { initializeAppearance } from "./appearance.js";
import { initializeSettings } from "./settings-ui.js";
import packageInfo from "../package.json";
import { ROCKETBOX_ASSISTANT, resolveAssistantRoute } from "./assistant-identity.js";
import { mountRocketBoxReactBridge } from "./react-mount.tsx";
import { initializeNativePersistence } from "./services/nativePersistence.ts";

async function boot() {
await initializeNativePersistence();

mountIcons();
document.querySelectorAll('.nav-button, .back-home').forEach(button => {
  const label = document.createElement('span'); label.className = 'nav-label';
  [...button.childNodes].filter(node => node.nodeName.toLowerCase() !== 'svg' && !node.classList?.contains('ocsis-icon') && !node.classList?.contains('nav-count')).forEach(node => label.append(node));
  button.insertBefore(label, button.querySelector('.nav-count'));
  button.setAttribute('aria-label', label.textContent.trim().replace(/\s+/g, ' '));
});
document.getElementById('nav-version').textContent = packageInfo.version;

const views = [...document.querySelectorAll(".view")];
const navButtons = [...document.querySelectorAll("[data-view]")];
const store = createWorkspaceStore({ storage: localStorage, key: WORKSPACE_KEY });
let libraryManager;
let settingsManager;
let reactBridge;

const viewTitles = {
  home: "Início",
  workspace: "Convés",
  trash: "Lixeira",
  register: "Registrar Asset",
  nautia: ROCKETBOX_ASSISTANT.name,
  settings: "Configurações",
};

let state = store.snapshot();
const preferences = createPreferencesService({ storage: localStorage, legacy: state });
const applyAppearance = initializeAppearance();
let editingFolder = null;
let noticeTimeout;

function notify(message, action = null) {
  clearTimeout(noticeTimeout);
  const output = document.getElementById("notification");
  output.replaceChildren(document.createTextNode(message));
  if (action) {
    const undo = document.createElement("button");
    undo.type = "button"; undo.className = "btn-ghost"; undo.textContent = action.label;
    undo.addEventListener("click", action.run); output.append(undo);
  }
  noticeTimeout = setTimeout(() => output.replaceChildren(), action ? 16000 : 10000);
}

function navigate(name) {
  if (location.hash === `#${name}`) showView(name, true);
  else location.hash = name;
}

function showView(name, focus = false) {
  const resolved = resolveAssistantRoute(name);
  if (resolved !== name) {
    name = resolved;
    history.replaceState(history.state, '', `#${resolved}`);
  }
  if (!Object.keys(viewTitles).includes(name)) name = "home";
  libraryManager?.cancelDrag();
  setCinematicView(name);
  views.forEach(view => {
    const active = view.id === `view-${name}`;
    view.classList.toggle("active", active);
    view.hidden = !active;
  });
  navButtons.forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.title = `RocketBox by OCSIS — ${viewTitles[name]}`;
  if (focus) {
    document.querySelector(`#view-${name} h1`)?.focus({ preventScroll: true });
    document.querySelector(".main-stage")?.scrollTo({ top: 0 });
  }
}

navButtons.forEach(button => button.addEventListener("click", () => {
  navigate(button.dataset.view);
}));
window.addEventListener("hashchange", () => showView(location.hash.slice(1), true));

for (const [id, key] of [['layout-toggle','layout'],['motion-toggle','animations']]) {
  document.getElementById(id).addEventListener('change', event => {
    try { preferences.set(key, key === 'animations' ? event.target.checked : event.target.value); }
    catch (error) { notify(error.message); applyAppearance(preferences.snapshot()); }
  });
}
window.addEventListener('storage', event => { if (event.key === PREFERENCES_KEY) preferences.reload(); });

// Diálogo reutilizado para renomeação de pastas disparada pelo Convés React.
const dialog = document.getElementById("folder-dialog");
const folderInput = document.getElementById("folder-name");
function showRenameFolderDialog(folder) {
  editingFolder = folder;
  folderInput.value = folder?.name ?? "";
  folderInput.setCustomValidity("");
  document.getElementById("folder-dialog-title").textContent = "Renomear pasta";
  dialog.showModal();
  folderInput.focus();
}
document.getElementById("cancel-folder").addEventListener("click", () => dialog.close());
folderInput.addEventListener("input", () => folderInput.setCustomValidity(""));
document.getElementById("folder-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!editingFolder) return;
  const name = folderInput.value.trim();
  const snap = store.snapshot();
  if (!name || snap.folders.some(f => !f.deleted && f.parent === editingFolder.parent && f.id !== editingFolder.id && f.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    folderInput.setCustomValidity(name ? "Já existe uma pasta com este nome aqui." : "Digite um nome para a pasta.");
    folderInput.reportValidity();
    return;
  }
  try {
    store.transact(draft => {
      const target = draft.folders.find(f => f.id === editingFolder.id);
      if (target) target.name = name;
    });
    state = store.snapshot();
    dialog.close();
    reactBridge?.syncFromStore();
    libraryManager?.refresh();
    settingsManager?.refreshData();
    notify("Pasta renomeada.");
  } catch (error) {
    notify(`Não foi possível gravar. ${error.message}`);
  }
});

libraryManager = initializeLibrary({
  store,
  notify,
  preferences,
  onChange: () => {
    state = store.snapshot();
    reactBridge?.syncFromStore();
    settingsManager?.refreshData();
  },
});

settingsManager = initializeSettings({
  preferences,
  store,
  notify,
  confirm: options => libraryManager.confirmAction(options),
  navigate,
});

reactBridge = mountRocketBoxReactBridge({
  store,
  preferences,
  notify,
  navigate,
  onExternalSync: () => {
    state = store.snapshot();
    libraryManager?.refresh();
    settingsManager?.refreshData();
  },
  onInspectAsset: asset => libraryManager.showDetails(asset),
  onTrashItem: ref => libraryManager.trash(ref),
  onRenameFolder: folder => showRenameFolderDialog(folder),
});

preferences.subscribe((p) => {
  applyAppearance(p);
});

if (store.readError) notify("Falha na leitura: biblioteca em modo protegido. Os dados existentes não serão sobrescritos.");
applyAppearance(preferences.snapshot());
showView(location.hash.slice(1) || preferences.snapshot().startup);
const initial = preferences.snapshot();
initializeCinematic(initial.animations && !!initial.animationIntensity && !initial.performance);
}

void boot();
