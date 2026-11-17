import { sortControl } from '../components/sort-control.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import {
  $,
  $$,
  escape,
  formData,
  handleForm,
  showError,
  stamp,
  dateLabel,
  modal,
  modalHead,
  openModal,
} from '../core/dom.js';
import { filterHtml, filterPanel, bindFilterPanel, pager, query } from '../components/filters.js';
import { bindSearchFields } from '../search.js';
import { notificationCard, notificationTitle } from '../components/notification-card.js';
import { changes, historyModal } from './history.js';
import { renderAccountRequests, refreshNotificationBadge } from '../components/account-menu.js';

export async function renderNotifications() {
  try {
    state.users = await api('/users');
  } catch (e) {
    return showError(e);
  }
  if (state.view !== 'notifications') return;
  $('#page').innerHTML = /* HTML */ `<header class="section">
      <div>
        <div class="eyebrow">Seguimiento</div>
        <h1>Notificaciones</h1>
        <span class="muted">Tocá una notificación para revisar lo que pasó.</span>
      </div>
    </header>
    <section class="notice" id="account-request-notice" hidden></section>
    <section class="card">
      <form id="notification-filters">
        ${filterPanel(state.notificationFilters, filterHtml(state.notificationFilters, true))}
      </form>
    </section>
    <section class="notification-list" id="notifications-list" aria-label="Notificaciones">
      Cargando…
    </section>`;
  bindSearchFields($('#notification-filters'), state.catalog);
  bindFilterPanel($('#notification-filters'), () => {
    state.notificationFilters = {};
    state.notificationPage = 0;
    renderNotifications();
  });
  void renderAccountRequests();
  handleForm($('#notification-filters'), async () => {
    state.notificationFilters = formData($('#notification-filters'));
    state.notificationPage = 0;
    await renderNotifications();
  });
  try {
    const data = await api(
      '/notifications?' +
        query({
          ...state.notificationFilters,
          sort: state.notificationSort,
          page: state.notificationPage,
        }),
    );
    if (state.view !== 'notifications') return;
    $('#notifications-list').innerHTML = /* HTML */ `<header class="section">
        <h2>${data.count} notificaciones</h2>
        ${sortControl(state.notificationSort)}
      </header>
      ${data.notifications.map(notificationCard).join('') ||
      '<div class="empty">No hay notificaciones para estos filtros.</div>'}${pager(
        state.notificationPage,
        data.count,
      )}`;
    $('[data-sort-control]').onchange = (event) => {
      state.notificationSort = event.target.value;
      state.notificationPage = 0;
      renderNotifications();
    };
    $('#previous').onclick = () => {
      state.notificationPage--;
      renderNotifications();
    };
    $('#next').onclick = () => {
      state.notificationPage++;
      renderNotifications();
    };
    $$('[data-notification]').forEach((button) => {
      button.onclick = () =>
        showNotification(
          data.notifications.find((item) => item.id === button.dataset.notification),
        );
    });
  } catch (e) {
    showError(e);
  }
}

export function showNotification(notification) {
  if (!notification) return;
  const relatedWarnings = (notification.details?.warnings || []).filter(
    (warning) => warning.reason === notification.reason,
  );

  openModal(
    /* HTML */ `${modalHead(notificationTitle(notification.reason))}
      <h3 class="notification-detail-heading">
        ${escape(notification.employee_name)} · ${escape(notification.place_name)}
      </h3>
      <p class="notification-detail-meta">
        ${escape(notification.user_name)}<br />
        <time datetime="${escape(notification.created_at)}"
          >${escape(stamp(notification.created_at))}</time
        ><br />
        Fecha trabajada:
        ${escape(dateLabel(notification.record_date))}${notification.deleted_at
          ? ' · Registro eliminado'
          : ''}
      </p>
      ${relatedWarnings.length
        ? `<div class="warning">${relatedWarnings.map((warning) => escape(warning.message)).join('<br>')}</div>`
        : ''}
      ${changes(notification.before_data, notification.after_data)}
      <div id="notification-detail-error" class="error" role="alert"></div>
      <div class="actions notification-detail-actions">
        <button type="button" id="notification-history">Historial completo</button>
        ${notification.reviewed_at
          ? '<span class="badge off">Revisado</span>'
          : '<button type="button" class="primary" id="review-notification">Marcar revisado</button>'}
      </div>`,
  );

  $('#notification-history').onclick = () => historyModal(notification.record_id);
  const reviewButton = $('#review-notification');
  if (reviewButton)
    reviewButton.onclick = async () => {
      reviewButton.disabled = true;
      try {
        await api('/notifications/' + notification.id + '/review', { method: 'POST' });
        modal.close();
        await renderNotifications();
        void refreshNotificationBadge();
      } catch (error) {
        showError(error, $('#notification-detail-error'));
        reviewButton.disabled = false;
      }
    };
}
