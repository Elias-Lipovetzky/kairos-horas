const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function confirmAction({
  title = 'Confirmar operación',
  message = '¿Querés continuar?',
  details = [],
  confirmLabel = 'Confirmar',
  danger = false,
} = {}) {
  const dialog = document.querySelector('#confirm-dialog');
  if (dialog.open) return Promise.resolve(false);
  dialog.innerHTML = /* HTML */ `<form method="dialog">
    <div class="eyebrow">REVISAR Y CONFIRMAR</div>
    <h2 id="confirm-title">${escape(title)}</h2>
    <p>${escape(message)}</p>
    ${details.length
      ? /* HTML */ `<ul class="confirmation-details">
          ${details.map((detail) => /* HTML */ `<li>${escape(detail)}</li>`).join('')}
        </ul>`
      : ''}
    <div class="actions">
      <button value="cancel" autofocus>Cancelar</button
      ><button value="confirm" class="${danger ? 'destructive' : 'primary'}">
        ${escape(confirmLabel)}
      </button>
    </div>
  </form>`;
  dialog.returnValue = '';
  return new Promise((resolve) => {
    dialog.onclose = () => {
      dialog.onclose = null;
      resolve(dialog.returnValue === 'confirm');
    };
    dialog.showModal();
  });
}
