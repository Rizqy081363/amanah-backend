import {
  BINARY_BODY_OMITTED,
  isSensitiveKey,
  REDACTED_VALUE,
  sanitizeHeaders,
  sanitizePayload,
} from './log-redaction.sanitizer';

describe('LogRedactionSanitizer', () => {
  describe('isSensitiveKey', () => {
    it('identifies sensitive keys case-insensitively', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('PASSWORD')).toBe(true);
      expect(isSensitiveKey('currentPassword')).toBe(true);
      expect(isSensitiveKey('accessToken')).toBe(true);
      expect(isSensitiveKey('refreshToken')).toBe(true);
      expect(isSensitiveKey('secret')).toBe(true);
      expect(isSensitiveKey('apiKey')).toBe(true);
      expect(isSensitiveKey('pin')).toBe(true);
      expect(isSensitiveKey('otp')).toBe(true);
      expect(isSensitiveKey('nik')).toBe(true);
      expect(isSensitiveKey('nationalIdEncrypted')).toBe(true);
      expect(isSensitiveKey('authorization')).toBe(true);
      expect(isSensitiveKey('cookie')).toBe(true);
    });

    it('returns false for non-sensitive keys', () => {
      expect(isSensitiveKey('name')).toBe(false);
      expect(isSensitiveKey('email')).toBe(false);
      expect(isSensitiveKey('doctorId')).toBe(false);
      expect(isSensitiveKey('scheduleDate')).toBe(false);
      expect(isSensitiveKey('status')).toBe(false);
    });
  });

  describe('sanitizeHeaders', () => {
    it('redacts sensitive headers while preserving non-sensitive headers', () => {
      const headers = {
        authorization: 'Bearer secret_jwt_token',
        cookie: 'session_id=12345',
        'content-type': 'application/json',
        'user-agent': 'Flutter-Dart/3.0',
        'x-custom-lang': 'id',
      };

      const sanitized = sanitizeHeaders(headers);

      expect(sanitized.authorization).toBe(REDACTED_VALUE);
      expect(sanitized.cookie).toBe(REDACTED_VALUE);
      expect(sanitized['content-type']).toBe('application/json');
      expect(sanitized['user-agent']).toBe('Flutter-Dart/3.0');
      expect(sanitized['x-custom-lang']).toBe('id');
    });
  });

  describe('sanitizePayload', () => {
    it('redacts sensitive fields recursively in objects and arrays', () => {
      const payload = {
        user: {
          email: 'user@example.com',
          password: 'SuperSecretPassword123!',
          tokens: [
            { accessToken: 'token_abc', type: 'bearer' },
            { refreshToken: 'token_xyz', type: 'refresh' },
          ],
        },
        profile: {
          nik: '3201234567890001',
          fullName: 'John Doe',
          nested: {
            authSecret: 'my_secret',
            otpCode: '123456',
          },
        },
      };

      const result = sanitizePayload(payload) as any;

      expect(result.user.email).toBe('user@example.com');
      expect(result.user.password).toBe(REDACTED_VALUE);
      expect(result.user.tokens[0].accessToken).toBe(REDACTED_VALUE);
      expect(result.user.tokens[0].type).toBe('bearer');
      expect(result.user.tokens[1].refreshToken).toBe(REDACTED_VALUE);
      expect(result.profile.nik).toBe(REDACTED_VALUE);
      expect(result.profile.fullName).toBe('John Doe');
      expect(result.profile.nested.authSecret).toBe(REDACTED_VALUE);
      expect(result.profile.nested.otpCode).toBe(REDACTED_VALUE);
    });

    it('omits binary buffer content and outputs metadata', () => {
      const buffer = Buffer.from('Binary file content here');
      const payload = {
        fileData: buffer,
        label: 'test document',
      };

      const result = sanitizePayload(payload) as any;

      expect(result.fileData._binaryOmitted).toBe(true);
      expect(result.fileData.type).toBe(BINARY_BODY_OMITTED);
      expect(result.fileData.byteLength).toBe(buffer.length);
      expect(result.label).toBe('test document');
    });

    it('extracts safe metadata from multer upload files', () => {
      const file = {
        fieldname: 'avatar',
        originalname: 'profile.jpg',
        mimetype: 'image/jpeg',
        size: 204800,
        buffer: Buffer.from('image bytes'),
      };

      const result = sanitizePayload({ upload: file }) as any;

      expect(result.upload.field).toBe('avatar');
      expect(result.upload.filename).toBe('profile.jpg');
      expect(result.upload.mimeType).toBe('image/jpeg');
      expect(result.upload.size).toBe(204800);
    });

    it('safely handles circular references without crashing', () => {
      const objA: any = { name: 'A' };
      const objB: any = { name: 'B', ref: objA };
      objA.ref = objB;

      const result = sanitizePayload(objA) as any;

      expect(result.name).toBe('A');
      expect(result.ref.name).toBe('B');
      expect(result.ref.ref).toBe('[CIRCULAR_REFERENCE]');
    });

    it('truncates oversized strings with explicit metadata', () => {
      const hugeString = 'A'.repeat(500);
      const result = sanitizePayload(
        { data: hugeString },
        { maxLength: 100 },
      ) as any;

      expect(result.data._truncated).toBe(true);
      expect(result.data._originalSize).toBe(500);
      expect(result.data._loggedSize).toBe(100);
      expect(result.data.preview).toContain('... [TRUNCATED]');
    });
  });
});
