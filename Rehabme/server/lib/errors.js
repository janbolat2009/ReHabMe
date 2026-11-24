export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (msg = 'Некорректный запрос', details) => new HttpError(400, 'bad_request', msg, details)
export const unauthorized = (msg = 'Требуется вход в систему') => new HttpError(401, 'unauthorized', msg)
export const forbidden = (msg = 'Недостаточно прав') => new HttpError(403, 'forbidden', msg)
export const notFound = (msg = 'Не найдено') => new HttpError(404, 'not_found', msg)
export const conflict = (msg = 'Конфликт данных') => new HttpError(409, 'conflict', msg)
export const unavailable = (msg = 'Сервис временно недоступен') => new HttpError(503, 'unavailable', msg)

// Wrap async route handlers so rejections reach the error middleware.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
