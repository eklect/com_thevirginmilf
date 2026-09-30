import { Type } from 'class-transformer';
import { IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class PushKeysDto {
  @IsString() @MinLength(16) @MaxLength(255) p256dh!: string;

  @IsString() @MinLength(8) @MaxLength(255) auth!: string;
}

/**
 * A browser's `PushSubscription.toJSON()`, minus `expirationTime` — the client
 * sends the two fields below and nothing else, because the pipeline refuses
 * unknown keys.
 */
export class SavePushSubscriptionDto {
  @IsString() @MinLength(16) @MaxLength(1024) endpoint!: string;

  @ValidateNested() @Type(() => PushKeysDto) keys!: PushKeysDto;
}

export class RemovePushSubscriptionDto {
  @IsString() @MinLength(16) @MaxLength(1024) endpoint!: string;
}
