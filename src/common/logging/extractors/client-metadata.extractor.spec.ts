import type { Request } from 'express';
import { extractClientMetadata } from './client-metadata.extractor';

describe('ClientMetadataExtractor', () => {
  it('extracts direct socket IP when trustProxy is disabled', () => {
    const mockReq = {
      headers: {
        'x-forwarded-for': '203.0.113.195, 198.51.100.10',
        'x-real-ip': '203.0.113.195',
      },
      socket: { remoteAddress: '192.168.1.50' },
      ip: '192.168.1.50',
    } as unknown as Request;

    const metadata = extractClientMetadata(mockReq, false);

    expect(metadata.ip).toBe('192.168.1.50');
    expect(metadata.ipType).toBe('direct_socket');
  });

  it('extracts forwarded IP when trustProxy is enabled', () => {
    const mockReq = {
      headers: {
        'x-forwarded-for': '203.0.113.195, 198.51.100.10',
        'x-real-ip': '203.0.113.195',
      },
      socket: { remoteAddress: '127.0.0.1' },
      ip: '127.0.0.1',
    } as unknown as Request;

    const metadata = extractClientMetadata(mockReq, true);

    expect(metadata.ip).toBe('203.0.113.195');
    expect(metadata.ipType).toBe('trusted_forwarded');
  });

  it('extracts custom client headers when provided', () => {
    const mockReq = {
      headers: {
        'user-agent': 'Dart/3.0 (dart:io)',
        'x-client-type': 'mobile-flutter',
        'x-platform': 'android',
        'x-app-version': '1.4.2',
        'x-app-build': '104',
        'x-device-model': 'Pixel 7 Pro',
        'x-os-version': 'Android 14',
      },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;

    const metadata = extractClientMetadata(mockReq, false);

    expect(metadata.type).toBe('mobile-flutter');
    expect(metadata.platform).toBe('android');
    expect(metadata.appVersion).toBe('1.4.2');
    expect(metadata.buildNumber).toBe('104');
    expect(metadata.deviceModel).toBe('Pixel 7 Pro');
    expect(metadata.osVersion).toBe('Android 14');
  });

  it('infers platform from User-Agent when custom headers are missing without faking device model', () => {
    const mockReq = {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
      },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;

    const metadata = extractClientMetadata(mockReq, false);

    expect(metadata.platform).toBe('android');
    expect(metadata.type).toBe('mobile');
    expect(metadata.deviceModel).toBeUndefined(); // Does not fake models
  });
});
