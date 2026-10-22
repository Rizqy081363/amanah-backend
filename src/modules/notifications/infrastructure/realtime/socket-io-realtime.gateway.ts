import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
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
import {
  buildOriginPolicy,
  isOriginAllowed,
} from '../../../../config/origin-policy';
import { RealtimeGatewayPort } from '../../contracts/realtime-gateway.interface';
import { REALTIME_ROOMS } from '../../notifications.constants';
import { RealtimeTicketService } from '../../application/services/realtime-ticket.service';

const wsDevOriginPatterns = (process.env.APP_DEV_ORIGIN_PATTERNS || '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

const wsRawAllowed = (
  process.env.REALTIME_CORS_ORIGINS ||
  process.env.APP_CORS_ORIGINS ||
  process.env.FRONTEND_DOMAIN ||
  ''
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const wsOriginPolicy = buildOriginPolicy({
  appEnv: process.env.NODE_ENV || 'development',
  publicUrl: process.env.FRONTEND_DOMAIN,
  extraOrigins: wsRawAllowed,
  devPatterns: wsDevOriginPatterns,
});

@Injectable()
@WebSocketGateway({
  cors: {
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, isOriginAllowed(requestOrigin, wsOriginPolicy));
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
    @Optional()
    private readonly realtimeTicketService?: RealtimeTicketService,
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

    // Middleware: Enforce handshake-level authentication before connection is admitted
    if (typeof server?.use === 'function') {
      server.use(async (socket, next) => {
        const rawTicket =
          socket.handshake.auth?.ticket ||
          (typeof socket.handshake.query?.ticket === 'string'
            ? socket.handshake.query.ticket
            : undefined);

        if (rawTicket) {
          if (!this.realtimeTicketService) {
            this.logger.warn(
              `realtime.reject reason=TICKET_SERVICE_UNAVAILABLE [id=${socket.id}]`,
            );
            return next(new Error('TICKET_SERVICE_UNAVAILABLE'));
          }

          const ticketData = await this.realtimeTicketService.consumeTicket(rawTicket);
          if (ticketData?.userId) {
            socket.data.userId = ticketData.userId;
            socket.data.user = ticketData;
            socket.data.role = ticketData.role || 'patient';
            return next();
          }

          this.logger.warn(
            `realtime.reject reason=AUTH_TICKET_INVALID_OR_EXPIRED [id=${socket.id}]`,
          );
          return next(new Error('AUTH_TICKET_INVALID'));
        }

        // Legacy fallback: check JWT
        const token = this.extractToken(socket);
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
              socket.data.userId = payload.id;
              socket.data.user = payload;
              socket.data.role =
                payload.systemRole ||
                payload.role?.name ||
                (typeof payload.role === 'string' ? payload.role : 'patient');
              return next();
            }
          } catch {
            // ignore error and proceed to better auth fallback
          }
        }

        // Legacy fallback: check Better Auth
        if (socket.handshake.headers) {
          try {
            const session = await betterAuth.api.getSession({
              headers: fromNodeHeaders(
                socket.handshake.headers as Record<string, string | string[]>,
              ),
            });
            if (session?.user?.id) {
              socket.data.userId = session.user.id;
              socket.data.user = session.user;
              socket.data.role = (session.user as any).role || 'patient';
              return next();
            }
          } catch {
            // ignore error
          }
        }

        this.logger.warn(
          `realtime.reject reason=AUTH_TICKET_MISSING [id=${socket.id}]`,
        );
        return next(new Error('AUTH_TICKET_MISSING'));
      });
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    const transport = client.conn?.transport?.name || 'unknown';
    const userId = client.data.userId;

    if (!userId) {
      this.logger.warn(
        `realtime.reject reason=AUTH_TICKET_MISSING [id=${client.id}]`,
      );
      client.emit?.('connect_error', {
        message: 'AUTH_TICKET_MISSING',
        code: 'AUTH_TICKET_MISSING',
      });
      client.disconnect(true);
      return;
    }

    const roleCode = client.data.role || 'patient';
    await client.join(REALTIME_ROOMS.user(userId));
    await client.join(REALTIME_ROOMS.role(roleCode));
    this.trackSocket(userId, client.id);

    this.logger.log(
      `realtime.connect userId=${userId} role=${roleCode} transport=${transport} [id=${client.id}]`,
    );
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

  async emitToRoom(
    roomName: string,
    event: string,
    payload: unknown,
  ): Promise<boolean> {
    if (!this.server) {
      this.logger.warn(
        `Cannot emit event "${event}" to room ${roomName}: server not ready`,
      );
      return false;
    }
    this.server.to(roomName).emit(event, payload);
    return true;
  }

  async broadcast(event: string, payload: unknown): Promise<boolean> {
    if (!this.server) {
      this.logger.warn(
        `Cannot broadcast event "${event}": server not ready`,
      );
      return false;
    }
    this.server.emit(event, payload);
    return true;
  }

  @SubscribeMessage('chat:join')
  async handleChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ): Promise<void> {
    if (data?.conversationId) {
      const room = `chat:${data.conversationId}`;
      await client.join(room);
      this.logger.debug(
        `Socket [${client.id}] joined conversation room [${room}]`,
      );
    }
  }

  @SubscribeMessage('chat:leave')
  async handleChatLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ): Promise<void> {
    if (data?.conversationId) {
      const room = `chat:${data.conversationId}`;
      await client.leave(room);
      this.logger.debug(
        `Socket [${client.id}] left conversation room [${room}]`,
      );
    }
  }

  @SubscribeMessage('chat:typing')
  handleChatTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ): void {
    if (!data?.conversationId) return;
    const room = `chat:${data.conversationId}`;
    const senderId = client.data?.userId;
    const senderRole = client.data?.role || 'customer';

    // Broadcast to other sockets in the conversation room
    client.to(room).emit('chat:typing', {
      conversationId: data.conversationId,
      senderId,
      senderRole,
      isTyping: Boolean(data.isTyping),
    });

    // Also broadcast to role:admin room if sender is customer/guest
    if (senderRole === 'customer' || senderRole === 'guest') {
      this.server.to('role:admin').emit('chat:typing', {
        conversationId: data.conversationId,
        senderId,
        senderRole: 'customer',
        isTyping: Boolean(data.isTyping),
      });
    }
  }

  isUserOnline(userId: string): boolean {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  isRoleOnline(roleName: string): boolean {
    if (!this.server) {
      return false;
    }
    const room = REALTIME_ROOMS.role(roleName);
    const roomSockets = this.server.sockets?.adapter?.rooms?.get(room);
    return (roomSockets?.size ?? 0) > 0;
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
