import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class SavePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @IsObject()
  keys: PushSubscriptionKeysDto;

  @IsString()
  @IsOptional()
  platform?: string;

  @IsString()
  @IsOptional()
  userAgent?: string;
}
