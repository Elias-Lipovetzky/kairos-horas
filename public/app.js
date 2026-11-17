import { bindDateInputs } from './components/date-input.js';
import { captureDraft } from './views/load.js';
import { state } from './core/state.js';
import { hasDraft } from './batch.js';
import { toast } from './core/dom.js';
import { login } from './views/access.js';
import { api, onSessionExpired } from './core/api.js';
import { loadCatalog } from './core/catalog.js';
import { refreshShell, setNavigationHandler } from './core/navigation.js';
import { renderShell } from './core/shell.js';
import { refreshNotificationBadge } from './components/account-menu.js';

window.addEventListener('beforeunload', (e) => {
  captureDraft();
  if (state.user && hasDraft(state.draftGroups)) {
    e.preventDefault();
    e.returnValue = '';
  }
});
window.addEventListener('offline', () =>
  toast('Sin conexión. No recargues la página si tenés datos sin guardar.'),
);
window.addEventListener('online', () =>
  toast('Conexión restablecida. Podés reintentar el guardado.'),
);
window.addEventListener('focus', () => {
  void refreshNotificationBadge();
});

export async function boot() {
  const reset = location.hash.match(/^#reset=([a-f0-9]{64})$/)?.[1];
  if (reset) return login(reset);
  try {
    state.user = await api('/me');
    await loadCatalog();
    refreshShell();
  } catch (e) {
    if (e.status !== 401) toast(e.message);
    state.user = null;
    login();
  }
}
onSessionExpired(() => login());
setNavigationHandler(renderShell);
bindDateInputs(document);
boot();
