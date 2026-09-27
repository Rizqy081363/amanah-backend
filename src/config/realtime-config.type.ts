export type RealtimeConfig = {
  port?: number;
  path: string;
  corsOrigins: string[];
  pingInterval: number;
  pingTimeout: number;
  patientCallTimeoutSeconds: number;
};
