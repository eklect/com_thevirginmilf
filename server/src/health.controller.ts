import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth/auth.decorators';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  health(): { ok: true } {
    return { ok: true };
  }
}
