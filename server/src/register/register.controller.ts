import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/auth/auth.decorators';
import { PageEnabledGuard } from '../site/page-enabled.guard';
import { RegisterService } from './register.service';
import { CreateRegisterDto } from './dto/create-register.dto';

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
  constructor(private readonly registerService: RegisterService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createRegisterDto: CreateRegisterDto, @Req() req: Request) {
    // Never log the body — it carries a plaintext password.
    //
    // The address and browser go to MAP with the consent, as the record of
    // WHO accepted the terms. `req.ip` is the visitor's because `main.ts`
    // trusts exactly the one nginx hop in front of this process.
    return this.registerService.create(createRegisterDto, {
      acceptedIp: req.ip,
      acceptedUserAgent: (req.get('user-agent') ?? '').slice(0, 255),
    });
  }
}
