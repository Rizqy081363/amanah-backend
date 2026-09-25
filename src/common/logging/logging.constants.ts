export const HTTP_EVENT_REQUEST = 'http.request';
export const HTTP_EVENT_RESPONSE = 'http.response';
export const HTTP_EVENT_ERROR = 'http.error';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';

export const CLIENT_METADATA_HEADERS = {
  CLIENT_TYPE: 'x-client-type',
  CLIENT_VERSION: 'x-client-version',
  APP_VERSION: 'x-app-version',
  APP_BUILD: 'x-app-build',
  PLATFORM: 'x-platform',
  DEVICE_ID: 'x-device-id',
  DEVICE_MODEL: 'x-device-model',
  OS_VERSION: 'x-os-version',
} as const;

export const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /credential/i,
  /private[_-]?key/i,
  /api[_-]?key/i,
  /pin/i,
  /otp/i,
  /cvv/i,
  /credit[_-]?card/i,
  /national[_-]?id/i,
  /nik/i,
  /jwt/i,
];

export const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-auth-token',
  'x-access-token',
  'x-refresh-token',
  'x-api-key',
]);

export const DEFAULT_MAX_LOG_BODY_LENGTH = 50000;
