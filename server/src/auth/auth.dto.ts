import { IsBoolean, IsOptional } from 'class-validator';

export class LogoutDto {
  /**
   * End every session this person holds anywhere, not just this browser.
   *
   * Opt-in, and surfaced in the UI as a separate control. Someone stepping away
   * from a shared machine wants the browser they are sitting at signed out — not
   * their phone and their laptop as well.
   */
  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}
