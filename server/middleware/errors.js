// Express recognizes error middleware by these four arguments.
export function handleApiError(error, req, res, next) {
  if (res.headersSent) return next(error);

  const databaseStatus = {
    23505: 409,
    23503: 400,
  };
  const status = error.status || databaseStatus[error.code] || 500;
  let message = error.message;

  if (error.code === '23505') {
    message = 'Ya existe un registro con ese DNI o correo.';
  } else if (error.code === '23503') {
    message = 'La entidad relacionada no está disponible.';
  } else if (status === 500) {
    console.error('Error de servidor:', error.message);
    message = 'No se pudo completar la operación. Reintentá.';
  }

  res.status(status).json({ message, ...error.details });
}
