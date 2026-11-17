import { $, escape, showError } from '../core/dom.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { icon } from './icons.js';

export function accountMenu() {
  const admin = state.user.role === 'admin';
  return /* HTML */ `<div class="account account-controls">
    ${admin
      ? `<button class="icon-button notification-bell" data-view="notifications" aria-label="Notificaciones" title="Notificaciones">
      ${icon('bell')}<span id="notification-count" class="notification-count" hidden></span>
    </button>`
      : ''}
    <details class="profile-menu">
      <summary aria-label="Abrir perfil">
        <span class="profile-avatar">${icon('user')}</span>
        <span class="profile-copy"
          ><strong>${escape(state.user.name)}</strong
          ><small>${admin ? 'Administrador' : 'Recursos Humanos'}</small></span
        >
        ${icon('chevron')}
      </summary>
      <div class="profile-options">
        <strong>${escape(state.user.name)}</strong><small>${escape(state.user.email)}</small>
        ${admin
          ? '<button type="button" id="account-requests">Solicitudes de cuentas</button>'
          : ''}
        <button type="button" id="logout">${icon('logout')} Cerrar sesión</button>
      </div>
    </details>
  </div>`;
}

export async function refreshNotificationBadge() {
  if (state.user?.role !== 'admin') return;
  const userId = state.user.id;
  const results = await Promise.allSettled([
    api('/notifications?state=pending&page=0'),
    api('/users'),
  ]);
  if (state.user?.id !== userId) return;
  const pendingEvents = results[0].status === 'fulfilled' ? results[0].value.count : 0;
  const pendingUsers =
    results[1].status === 'fulfilled'
      ? results[1].value.filter((user) => user.registration_pending).length
      : 0;
  const count = pendingEvents + pendingUsers;
  const badge = $('#notification-count');
  if (badge) {
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.parentElement.setAttribute('aria-label', `Notificaciones: ${count} pendientes`);
  }
}

export async function renderAccountRequests() {
  try {
    const users = await api('/users');
    const count = users.filter((user) => user.registration_pending).length;
    const panel = $('#account-request-notice');
    if (!panel || state.view !== 'notifications') return;
    panel.hidden = !count;
    panel.innerHTML = `<strong>${count} solicitudes de cuenta pendientes</strong>
      <p>Revisá los datos y activá las cuentas autorizadas desde Administración → Usuarios.</p>
      <button type="button" id="review-account-requests">Revisar cuentas</button>`;
    if (count) $('#review-account-requests').onclick = () => $('#account-requests').click();
  } catch (error) {
    showError(error);
  }
}
