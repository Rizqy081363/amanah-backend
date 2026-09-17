export type JwtPayloadType = {
  id: string;
  email?: string;
  systemRole?: string;
  role?: any;
  sessionId?: string;
  iat?: number;
  exp?: number;
};
