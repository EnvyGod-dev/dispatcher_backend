import { HTTPException } from 'hono/http-exception';
import type { StatusCode } from 'hono/utils/http-status';

export class Unauthorized extends HTTPException {
  constructor(message?: string) {
    super(403 as StatusCode, {
      message: message || 'Зөвшөөрөлгүй.',
    });

    this.name = 'Зөвшөөрөлгүй.';

    Error.captureStackTrace?.(this, Unauthorized);
  }
}

export class NotFound extends HTTPException {
  constructor(message?: string) {
    super(422 as StatusCode, {
      message: message || 'Бүртгэлтэй мэдээлэл олдсонгүй.',
    });

    this.name = 'NotFound';

    Error.captureStackTrace?.(this, NotFound);
  }
}

export class ClientError extends HTTPException {
  constructor(message: string) {
    super(422 as StatusCode, {
      message: message,
    });

    Error.captureStackTrace?.(this, Unauthorized);
  }
}

export class Forbidden extends Error {
  constructor() {
    super('Зөвшөөрөлгүй.');
  }
}
