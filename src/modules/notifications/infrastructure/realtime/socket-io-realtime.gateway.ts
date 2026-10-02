import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import { fromNodeHeaders } from 'better-auth/node';
import type Redis from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { auth as betterAuth } from '../../../../auth/better-auth/auth';
import { JwtPayloadType } from '../../../../auth/strategies/types/jwt-payload.type';
import { REDIS_CLIENT } from '../../../../common/redis/redis.constants';
import { AllConfigType } from '../../../../config/config.type';
import { RealtimeGatewayPort } from '../../contracts/realtime-gateway.interface';
import { REALTIME_ROOMS } from '../../notifications.constants';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!requestOrigin) {
        return callback(null, true);
      }
      const rawAllowed =
        process.env.REALTIME_CORS_ORIGINS ||
        process.env.APP_CORS_ORIGINS ||
        process.env.FRONTEND_DOMAIN ||
        'http://localhost:3000,http://127.0.0.1:3000';
      const allowedOrigins = rawAllowed
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

      if (
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(requestOrigin)
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'],
})
export class SocketIoRealtimeGateway
  implements
    RealtimeGatewayPort,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect
{
  private readonly logger = new Logger(SocketIoRealtimeGateway.name);
  private readonly userSockets = new Map<string, Set<string>>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redisClient?: Redis,
  ) {}

  afterInit(server: Server): void {
    this.server = server;
    if (this.redisClient && typeof this.redisClient.duplicate === 'function') {
      try {
        const pubClient = this.redisClient.duplicate();
        const subClient = this.redisClient.duplicate();
        server.adapter(createAdapter(pubClient, subClient));
        this.logger.log('Socket.IO Redis adapter initialized successfully.');
      } catch (error) {
        this.logger.warn(
          `Failed to initialize Socket.IO Redis adapter, falling back to memory adapter: ${error}`,
        );
      }
    } else {
      this.logger.log('Socket.IO initialized with default in-memory adapter.');
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);

    if (token) {
      try {
        const secret = this.configService.getOrThrow('auth.secret', {
          infer: true,
        });
        const payload = await this.jwtService.verifyAsync<JwtPayloadType>(
          token,
          { secret },
        );

        if (payload?.id) {
          client.data.userId = payload.id;
          client.data.user = payload;

          await client.join(REALTIME_ROOMS.user(payload.id));
          const roleCode =
            payload.systemRole ||
            payload.role?.name ||
            (typeof payload.role === 'string' ? payload.role : null);
          if (roleCode && typeof roleCode === 'string') {
            await client.join(REALTIME_ROOMS.role(roleCode));
          }
          this.trackSocket(payload.id, client.id);

          this.logger.debug(
            `Socket connected via JWT and joined room user:${payload.id} [id=${client.id}]`,
          );
          return;
        }
      } catch (jwtError) {
        this.logger.debug(
          `JWT verification failed for socket [id=${client.id}], checking Better Auth: ${jwtError}`,
        );
      }
    }

    // Fallback: Check Better Auth session from handshake headers (e.g. cookie)
    if (client.handshake.headers) {
      try {
        const session = await betterAuth.api.getSession({
          headers: fromNodeHeaders(
            client.handshake.headers as Record<string, string | string[]>,
          ),
        });

        if (session?.user?.id) {
          const userId = session.user.id;
          client.data.userId = userId;
          client.data.user = session.user;

          await client.join(REALTIME_ROOMS.user(userId));
          const roleCode = (session.user as any).role || 'patient';
          if (roleCode && typeof roleCode === 'string') {
            await client.join(REALTIME_ROOMS.role(roleCode));
          }
          this.trackSocket(userId, client.id);

          this.logger.debug(
            `Socket connected via Better Auth session and joined room user:${userId} [id=${client.id}]`,
          );
          return;
        }
      } catch (betterAuthErr) {
        this.logger.debug(
          `Better Auth session verification failed for socket [id=${client.id}]: ${betterAuthErr}`,
        );
      }
    }

    this.logger.warn(
      `Socket connection rejected [id=${client.id}]: authentication failed (no valid JWT or session)`,
    );
    client.disconnect(true);
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data?.userId as string | undefined;
    if (userId) {
      this.untrackSocket(userId, client.id);
      this.logger.debug(
        `Socket disconnected for user ${userId} [id=${client.id}]`,
      );
    }
  }

  async emitToUser(
    userId: string,
    event: string,
    payload: unknown,
  ): Promise<boolean> {
    if (!this.server) {
      this.logger.warn(
        `Cannot emit event "${event}" to user ${userId}: server not ready`,
      );
      return false;
    }

    const room = REALTIME_ROOMS.user(userId);
    this.server.to(room).emit(event, payload);
    return true;
  }

  async emitToRole(
    roleName: string,
    event: string,
    payload: unknown,
  ): Promise<boolean> {
    if (!this.server) {
      this.logger.warn(
        `Cannot emit event "${event}" to role ${roleName}: server not ready`,
      );
      return false;
    }

    const room = REALTIME_ROOMS.role(roleName);
    this.server.to(room).emit(event, payload);
    return true;
  }

  isUserOnline(userId: string): boolean {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  getConnectedUserCount(): number {
    return this.userSockets.size;
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader && typeof authHeader === 'string') {
      return authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : authHeader.trim();
    }

    const authToken = client.handshake.auth?.token;
    if (authToken && typeof authToken === 'string') {
      return authToken.trim();
    }

    const queryToken = client.handshake.query?.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken.trim();
    }

    // Extract HttpOnly cookie (amanah_access_token) from web browser handshake
    const cookieHeader = client.handshake.headers?.cookie;
    if (cookieHeader && typeof cookieHeader === 'string') {
      const match = cookieHeader.match(/amanah_access_token=([^;]+)/);
      if (match?.[1]) {
        return decodeURIComponent(match[1].trim());
      }
    }

    return null;
  }

  private trackSocket(userId: string, socketId: string): void {
    let sockets = this.userSockets.get(userId);
    if (!sockets) {
      sockets = new Set<string>();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);
  }

  private untrackSocket(userId: string, socketId: string): void {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }
}
