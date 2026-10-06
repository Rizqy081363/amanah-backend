export type AppConfig = {
  nodeEnv: string;
  name: string;
  workingDirectory: string;
  frontendDomain?: string;
  backendDomain: string;
  corsOrigins: string[];
  port: number;
  apiPrefix: string;
  headerLanguage: string;
  logLevel: string;
  logPretty: boolean;
  httpLogRequestBody: boolean;
  httpLogResponseBody: boolean;
  httpLogMaxBodyLength: number;
  trustProxy: boolean | string;
  timezone: string;
};
