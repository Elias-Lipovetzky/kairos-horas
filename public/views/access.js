import { brand } from '../components/brand.js';
import {
  $,
  app,
  field,
  formData,
  handleForm,
  input,
  modal,
  modalHead,
  openModal,
  toast,
  escape,
} from '../core/dom.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { loadCatalog } from '../core/catalog.js';
import { refreshShell } from '../core/navigation.js';

export async function login(resetToken = null) {
  app.innerHTML = /* HTML */ `<main class="login">
    ${brand()}
    <div class="card">
      <div class="eyebrow">Gestión de jornadas</div>
      <h1>${resetToken ? 'Nueva contraseña' : 'Tu equipo, su tiempo.'}</h1>
      <p class="muted">
        ${resetToken
          ? 'Elegí una contraseña de al menos 12 caracteres.'
          : 'Ingresá para registrar y consultar las horas de trabajo.'}
      </p>
      <form id="login-form">
        ${resetToken
          ? ''
          : field(
              'Correo',
              input('email', '', 'email', 'required autocomplete="username"'),
            )}${field(
          'Contraseña',
          input(
            'password',
            '',
            'password',
            `required ${resetToken ? 'minlength="12" autocomplete="new-password"' : 'autocomplete="current-password"'}`,
          ),
        )}
        <div class="error" role="alert"></div>
        <button type="submit" class="primary">
          ${resetToken ? 'Guardar contraseña' : 'Ingresar'}
        </button>
      </form>
      ${resetToken ? '' : '<button class="quiet" id="forgot">Olvidé mi contraseña</button>'}
      ${resetToken
        ? ''
        : '<div class="signup-link">¿No tenés cuenta? <button class="quiet" id="show-signup">Crear cuenta</button></div>'}
    </div>
    <footer>Kairos · Registro de horas de trabajo</footer>
  </main>`;
  handleForm($('#login-form'), async () => {
    const data = formData($('#login-form'));
    if (resetToken) {
      await api('/reset-password', {
        method: 'POST',
        body: JSON.stringify({ ...data, token: resetToken }),
      });
      history.replaceState(null, '', location.pathname);
      toast('Contraseña actualizada.');
      return login();
    }
    state.user = await api('/login', { method: 'POST', body: JSON.stringify(data) });
    await loadCatalog();
    refreshShell();
  });
  if ($('#forgot'))
    $('#forgot').onclick = async () => {
      openModal(
        /* HTML */ `${modalHead('Recuperar acceso')}
          <p class="muted">
            Te enviaremos un enlace si tu cuenta está activa y el correo está configurado.
          </p>
          <form id="recover-form">
            ${field('Correo', input('email', '', 'email', 'required'))}
            <div class="error" role="alert"></div>
            <button class="primary" type="submit">Enviar enlace</button>
          </form>`,
      );
      handleForm($('#recover-form'), async () => {
        const r = await api('/forgot-password', {
          method: 'POST',
          body: JSON.stringify(formData($('#recover-form'))),
        });
        modal.close();
        toast(r.message);
      });
    };
  if ($('#show-signup')) $('#show-signup').onclick = () => signup();
}

export function signup() {
  app.innerHTML = /* HTML */ `<main class="login">
    ${brand()}
    <section class="card">
      <div class="eyebrow">NUEVA CUENTA</div>
      <h1>Solicitar acceso</h1>
      <p class="muted">
        Creá tu cuenta. Un administrador debe aprobar el acceso de Recursos Humanos.
      </p>
      <form id="signup-form">
        ${field(
          'Nombre',
          input('name', '', 'text', 'required maxlength="200" autocomplete="name"'),
        )}
        ${field(
          'Correo',
          input('email', '', 'email', 'required maxlength="200" autocomplete="email"'),
        )}
        ${field(
          'Contraseña',
          input(
            'password',
            '',
            'password',
            'required minlength="12" maxlength="200" autocomplete="new-password"',
          ),
        )}
        ${field(
          'Repetir contraseña',
          input(
            'password_confirmation',
            '',
            'password',
            'required minlength="12" maxlength="200" autocomplete="new-password"',
          ),
        )}
        <div class="error" role="alert"></div>
        <button type="submit" class="primary">Crear cuenta</button>
      </form>
      <button type="button" class="quiet" id="back-to-login">Volver al ingreso</button>
    </section>
  </main>`;
  $('#back-to-login').onclick = () => login();
  handleForm($('#signup-form'), async () => {
    const data = formData($('#signup-form'));
    if (data.password !== data.password_confirmation) {
      throw new Error('Las contraseñas no coinciden.');
    }
    delete data.password_confirmation;
    const result = await api('/signup', { method: 'POST', body: JSON.stringify(data) });
    app.innerHTML = /* HTML */ `<main class="login">
      <section class="card">
        <h1>Solicitud enviada</h1>
        <p class="notice">${escape(result.message)}</p>
        <button id="signup-finished" class="primary">Volver al ingreso</button>
      </section>
    </main>`;
    $('#signup-finished').onclick = () => login();
  });
}
