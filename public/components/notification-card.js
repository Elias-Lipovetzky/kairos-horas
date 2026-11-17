import { formatDate, formatTime } from '../../shared/dates.js';
import { escape } from '../core/dom.js';
import { icon } from './icons.js';

const eventTitles = {
  create: 'Registro creado',
  update: 'Registro modificado',
  delete: 'Registro eliminado',
  duplicate: 'Posible duplicado',
  overlap: 'Horarios superpuestos',
  long_duration: 'Más de 9 horas',
};

export function notificationTitle(reason) {
  return eventTitles[reason] || reason;
}

export function notificationCard(notification) {
  const title = notificationTitle(notification.reason);
  const reviewed = Boolean(notification.reviewed_at);
  const warning = ['duplicate', 'overlap', 'long_duration'].includes(notification.reason);
  const date = formatDate(notification.created_at);
  const time = formatTime(notification.created_at);

  return /* HTML */ `<article
    class="notification-card ${reviewed ? 'is-reviewed' : 'is-pending'} ${warning
      ? 'is-warning'
      : ''}"
  >
    <button
      type="button"
      class="notification-trigger"
      data-notification="${escape(notification.id)}"
      aria-label="${escape(
        title + ': ' + notification.employee_name + ' · ' + notification.place_name,
      )}"
      aria-haspopup="dialog"
    >
      <span class="notification-topline">
        <span class="notification-event">${escape(title)}</span>
        <time class="notification-time" datetime="${escape(notification.created_at)}">
          <span>${escape(date)}</span><strong>${escape(time)}</strong>
        </time>
      </span>
      <span class="notification-heading"
        >${escape(notification.employee_name)} · ${escape(notification.place_name)}</span
      >
      <span class="notification-attribution">${escape(notification.user_name)}</span>
      <span class="notification-bottomline">
        <span class="notification-status"
          ><span class="notification-status-dot" aria-hidden="true"></span>${reviewed
            ? 'Revisado'
            : 'Pendiente de revisión'}</span
        >
        ${icon('chevron')}
      </span>
    </button>
  </article>`;
}
