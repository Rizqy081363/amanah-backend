import { registerAs } from '@nestjs/config';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import validateConfig from '../utils/validate-config';
import { RealtimeConfig } from './realtime-config.type';

class EnvironmentVariablesValidator {
  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  REALTIME_GATEWAY_PORT?: number;

  @IsString()
  @IsOptional()
  REALTIME_PATH?: string;

  @IsString()
  @IsOptional()
  REALTIME_CORS_ORIGINS?: string;

  @IsInt()
  @Min(1000)
  @Max(120000)
  @IsOptional()
  REALTIME_PING_INTERVAL_MS?: number;

  @IsInt()
  @Min(1000)
  @Max(120000)
  @IsOptional()
  REALTIME_PING_TIMEOUT_MS?: number;

  @IsInt()
  @Min(10)
  @Max(3600)
  @IsOptional()
  PATIENT_CALL_TIMEOUT_SECONDS?: number;
}

export default registerAs<RealtimeConfig>('realtime', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  const corsOrigins = (
    process.env.REALTIME_CORS_ORIGINS ||
    process.env.APP_CORS_ORIGINS ||
    process.env.FRONTEND_DOMAIN ||
    '*'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return {
    port: process.env.REALTIME_GATEWAY_PORT
      ? parseInt(process.env.REALTIME_GATEWAY_PORT, 10)
      : undefined,
    path: process.env.REALTIME_PATH || '/socket.io',
    corsOrigins,
    pingInterval: process.env.REALTIME_PING_INTERVAL_MS
      ? parseInt(process.env.REALTIME_PING_INTERVAL_MS, 10)
      : 25000,
    pingTimeout: process.env.REALTIME_PING_TIMEOUT_MS
      ? parseInt(process.env.REALTIME_PING_TIMEOUT_MS, 10)
      : 20000,
    patientCallTimeoutSeconds: process.env.PATIENT_CALL_TIMEOUT_SECONDS
      ? parseInt(process.env.PATIENT_CALL_TIMEOUT_SECONDS, 10)
      : 180,
  };
});
