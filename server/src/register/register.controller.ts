import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
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
  create(@Body() createRegisterDto: CreateRegisterDto) {
    // Never log the body — it carries a plaintext password.
    return this.registerService.create(createRegisterDto);
  }
}
