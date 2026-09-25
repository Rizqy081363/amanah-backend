import type { Request } from 'express';
import { CLIENT_METADATA_HEADERS } from '../logging.constants';

export interface ClientMetadata {
  ip: string;
  ipType: 'trusted_forwarded' | 'direct_socket';
  userAgent?: string;
  type?: string;
  platform?: string;
  appVersion?: string;
  buildNumber?: string;
  deviceId?: string;
  deviceModel?: string;
  osVersion?: string;
  origin?: string;
  referer?: string;
}

export function extractClientMetadata(
  req: Request,
  trustProxy: boolean | string = false,
): ClientMetadata {
  const headers = req.headers || {};
  let ip = req.socket?.remoteAddress || req.ip || '127.0.0.1';
  let ipType: 'trusted_forwarded' | 'direct_socket' = 'direct_socket';

  const isProxyTrusted =
    trustProxy === true ||
    trustProxy === 'true' ||
    trustProxy === '1' ||
    (typeof trustProxy === 'string' &&
      trustProxy.length > 0 &&
      trustProxy !== 'false');

  if (isProxyTrusted) {
    const forwarded = headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
      const parts = forwarded.split(',').map((p) => p.trim());
      if (parts[0]) {
        ip = parts[0];
        ipType = 'trusted_forwarded';
      }
    } else {
      const realIp = headers['x-real-ip'];
      if (typeof realIp === 'string' && realIp.trim().length > 0) {
        ip = realIp.trim();
        ipType = 'trusted_forwarded';
      }
    }
  }

  const userAgent =
    typeof headers['user-agent'] === 'string'
      ? headers['user-agent']
      : undefined;
  const origin =
    typeof headers.origin === 'string' ? headers.origin : undefined;
  const referer =
    typeof headers.referer === 'string' ? headers.referer : undefined;

  // Custom client headers
  const customType =
    typeof headers[CLIENT_METADATA_HEADERS.CLIENT_TYPE] === 'string'
      ? (headers[CLIENT_METADATA_HEADERS.CLIENT_TYPE] as string).trim()
      : undefined;

  const customPlatform =
    typeof headers[CLIENT_METADATA_HEADERS.PLATFORM] === 'string'
      ? (headers[CLIENT_METADATA_HEADERS.PLATFORM] as string).trim()
      : undefined;

  const customAppVersion =
    typeof headers[CLIENT_METADATA_HEADERS.APP_VERSION] === 'string'
      ? (headers[CLIENT_METADATA_HEADERS.APP_VERSION] as string).trim()
      : typeof headers[CLIENT_METADATA_HEADERS.CLIENT_VERSION] === 'string'
        ? (headers[CLIENT_METADATA_HEADERS.CLIENT_VERSION] as string).trim()
        : undefined;

  const customBuild =
    typeof headers[CLIENT_METADATA_HEADERS.APP_BUILD] === 'string'
      ? (headers[CLIENT_METADATA_HEADERS.APP_BUILD] as string).trim()
      : undefined;

  const customDeviceId =
    typeof headers[CLIENT_METADATA_HEADERS.DEVICE_ID] === 'string'
      ? (headers[CLIENT_METADATA_HEADERS.DEVICE_ID] as string).trim()
      : undefined;

  const customDeviceModel =
    typeof headers[CLIENT_METADATA_HEADERS.DEVICE_MODEL] === 'string'
      ? (headers[CLIENT_METADATA_HEADERS.DEVICE_MODEL] as string).trim()
      : undefined;

  const customOsVersion =
    typeof headers[CLIENT_METADATA_HEADERS.OS_VERSION] === 'string'
      ? (headers[CLIENT_METADATA_HEADERS.OS_VERSION] as string).trim()
      : undefined;

  // Derive type or platform if missing from User-Agent
  let derivedType = customType;
  let derivedPlatform = customPlatform;

  if (!derivedPlatform && userAgent) {
    const uaLower = userAgent.toLowerCase();
    if (uaLower.includes('android')) {
      derivedPlatform = 'android';
      if (!derivedType) derivedType = 'mobile';
    } else if (
      uaLower.includes('iphone') ||
      uaLower.includes('ipad') ||
      uaLower.includes('ios')
    ) {
      derivedPlatform = 'ios';
      if (!derivedType) derivedType = 'mobile';
    } else if (uaLower.includes('windows')) {
      derivedPlatform = 'windows';
      if (!derivedType) derivedType = 'web';
    } else if (uaLower.includes('macintosh') || uaLower.includes('mac os')) {
      derivedPlatform = 'macos';
      if (!derivedType) derivedType = 'web';
    } else if (uaLower.includes('linux')) {
      derivedPlatform = 'linux';
      if (!derivedType) derivedType = 'web';
    }
  }

  const result: ClientMetadata = {
    ip,
    ipType,
  };

  if (userAgent) result.userAgent = userAgent;
  if (derivedType) result.type = derivedType;
  if (derivedPlatform) result.platform = derivedPlatform;
  if (customAppVersion) result.appVersion = customAppVersion;
  if (customBuild) result.buildNumber = customBuild;
  if (customDeviceId) result.deviceId = customDeviceId;
  if (customDeviceModel) result.deviceModel = customDeviceModel;
  if (customOsVersion) result.osVersion = customOsVersion;
  if (origin) result.origin = origin;
  if (referer) result.referer = referer;

  return result;
}
