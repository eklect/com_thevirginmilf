import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/auth/auth.decorators';
import { PageEnabledGuard } from '../site/page-enabled.guard';
import { AuthFlowService } from '../auth/auth-flow.service';
import { RegisterService } from './register.service';
import { CreateRegisterDto } from './dto/create-register.dto';
import { SocialRegisterDto } from './dto/social-register.dto';

/**
 * Signup, and nothing else.
 *
 * Public by necessity — nobody has an account yet — and switched off along with
 * the sign-up page, so an admin who hides the page also closes the endpoint.
 */
@Public()
@UseGuards(PageEnabledGuard('signup'))
@Controller('register')
export class RegisterController {
  constructor(
    private readonly registerService: RegisterService,
    private readonly authFlow: AuthFlowService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createRegisterDto: CreateRegisterDto,
    @Req() request: Request,
  ) {
    // Never log the body — it carries a plaintext password.
    //
    // The address and user agent travel with the acceptance so MAP's record of
    // it says where the agreement came from — the same evidence a clickwrap
    // needs to stand up later. `request.ip` is the browser's, because Nest
    // trusts the loopback proxy (nginx) in front of it.
    return this.registerService.create(createRegisterDto, {
      acceptedIp: request.ip,
      acceptedUserAgent: (request.get('user-agent') ?? '').slice(0, 255),
    });
  }

  /**
   * The same form, submitted with a provider button instead of a password.
   *
   * Nothing is created here. The fields are sealed into the OAuth transaction
   * cookie and the browser is sent to MAP, which signs the person in through the
   * provider — creating the identity on a first visit — and comes back through
   * `/auth/callback`, where `RegisterService.completeSocial` does the rest. The
   * Terms box must be ticked, exactly as for the form; MAP records the
   * acceptance against the new account with this site as the application.
   */
  @Post('social')
  @HttpCode(HttpStatus.OK)
  social(
    @Body() dto: SocialRegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): { redirectTo: string } {
    const redirectTo = this.authFlow.begin(response, {
      origin: originOf(request),
      returnTo: this.registerService.socialReturnTo(),
      provider: dto.provider,
      termsAccepted: true,
      pendingSignup: this.registerService.pendingFrom(dto),
    });
    return { redirectTo };
  }
}

/** The origin the browser used, so the matching registered callback is chosen. */
function originOf(request: Request): string | undefined {
  const host = request.get('host');
  return host ? `${request.protocol}://${host}` : undefined;
}
