import { brand } from '../components/brand.js';
import { $, $$, app, escape, showError } from './dom.js';
import { newId } from './ids.js';
import { state } from './state.js';
import { captureDraft, renderLoad } from '../views/load.js';
import { refreshShell } from './navigation.js';
import { hasDraft } from '../batch.js';
import { confirmAction } from '../dialogs.js';
import { api } from './api.js';
import { login } from '../views/access.js';
import { renderRecords } from '../views/records.js';
import { renderNotifications } from '../views/notifications.js';
import { renderCatalog } from '../views/catalog.js';
import { renderAudit } from '../views/history.js';

import { icon } from '../components/icons.js';
import { accountMenu, refreshNotificationBadge } from '../components/account-menu.js';

export function renderShell() {
  const actions = [
    ['load', 'Cargar horas'],
    ['records', 'Registros'],
    ...(state.user.role === 'admin'
      ? [
          ['catalog', 'Administración'],
          ['audit', 'Historial'],
        ]
      : []),
  ];
  app.innerHTML = /* HTML */ `<div
    id="app-shell"
    class="app-shell ${state.navigationOpen ? 'navigation-open' : ''}"
  >
    ${navigator.onLine
      ? ''
      : '<div class="network">Sin conexión. Es necesario conectarse para guardar.</div>'}
    <header class="topbar">
      <div class="header-start">
        <button
          type="button"
          class="icon-button"
          id="navigation-toggle"
          aria-controls="main-navigation"
          aria-expanded="${state.navigationOpen}"
          aria-label="Mostrar u ocultar navegación"
        >
          ${icon('menu')}
        </button>
        ${brand()}
      </div>
      ${accountMenu()}
    </header>
    <button
      type="button"
      class="navigation-backdrop"
      id="navigation-backdrop"
      aria-label="Cerrar navegación"
      ${state.navigationOpen ? '' : 'hidden'}
    ></button>
    <aside class="sidebar" id="main-navigation" aria-label="Navegación principal">
      <nav class="sidebar-actions">
        ${actions
          .map(
            ([key, label]) =>
              `<button type="button" data-view="${key}" class="sidebar-action ${state.view === key ? 'selected' : ''}" title="${label}" aria-label="${label}" ${state.view === key ? 'aria-current="page"' : ''}>${icon(key)}<span class="navigation-label">${label}</span></button>`,
          )
          .join('')}
      </nav>
    </aside>
    <main class="workspace">
      <div id="page-error" class="error" role="alert"></div>
      <div id="page"></div>
      <footer class="page">
        Kairos · Horarios de Argentina · Los cambios quedan registrados con tu usuario.
      </footer>
    </main>
  </div>`;

  function setNavigation(open) {
    state.navigationOpen = open;
    $('#app-shell').classList.toggle('navigation-open', open);
    $('#navigation-toggle').setAttribute('aria-expanded', String(open));
    $('#navigation-backdrop').hidden = !open;
  }
  function navigate(view) {
    if (state.busy) return;
    captureDraft();
    state.view = view;
    state.navigationOpen = false;
    refreshShell();
  }
  $('#navigation-toggle').onclick = () => setNavigation(!state.navigationOpen);
  $('#navigation-backdrop').onclick = () => {
    setNavigation(false);
    $('#navigation-toggle').focus();
  };
  $('#app-shell').onkeydown = (event) => {
    if (event.key === 'Escape' && state.navigationOpen) {
      setNavigation(false);
      $('#navigation-toggle').focus();
    }
  };
  $$('[data-view]').forEach((button) => (button.onclick = () => navigate(button.dataset.view)));
  if ($('#account-requests'))
    $('#account-requests').onclick = () => {
      state.activeEntity = 'users';
      navigate('catalog');
    };
  const profile = $('.profile-menu');
  profile.onfocusout = (event) => {
    if (!profile.contains(event.relatedTarget)) profile.open = false;
  };
  profile.onkeydown = (event) => {
    if (event.key === 'Escape') {
      profile.open = false;
      $('summary', profile).focus();
    }
  };
  $('#logout').onclick = async () => {
    if (state.busy) return;
    captureDraft();
    if (
      hasDraft(state.draftGroups) &&
      !(await confirmAction({
        title: 'Cerrar sesión',
        message: 'Hay filas sin guardar. ¿Querés descartarlas?',
        confirmLabel: 'Salir y descartar',
        danger: true,
      }))
    )
      return;
    try {
      await api('/logout', { method: 'POST' });
      state.user = null;
      state.draftGroups = [{ employee_id: '', rows: [{}] }];
      state.submissionId = newId();
      login();
    } catch (e) {
      showError(e);
    }
  };
  ({
    load: renderLoad,
    records: renderRecords,
    notifications: renderNotifications,
    catalog: renderCatalog,
    audit: renderAudit,
  })[state.view]();
  void refreshNotificationBadge();
}
