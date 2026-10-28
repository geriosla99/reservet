// Error esperado de negocio: se traduce a un código HTTP sin exponer detalles internos.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
