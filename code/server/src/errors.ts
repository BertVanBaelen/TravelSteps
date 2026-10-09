export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, 'UNAUTHENTICATED', 'Je bent niet ingelogd.');
export const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Je hebt hier geen toegang toe.');
export const notFound = (what = 'Item') =>
  new HttpError(404, 'NOT_FOUND', `${what} niet gevonden.`);
