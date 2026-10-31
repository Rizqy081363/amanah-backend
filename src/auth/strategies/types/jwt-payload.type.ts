export type JwtPayloadType = {
  id: string;
  email?: string;
  name?: string;
  systemRole?: string;
  role?: any;
  sessionId?: string;
  authVersion?: number;
  iat?: number;
  exp?: number;
};
