import { IsBoolean } from 'class-validator';

export class UpdateSubscriptionDto {
  /** The email switch on the account page. */
  @IsBoolean()
  emailAlerts!: boolean;
}
