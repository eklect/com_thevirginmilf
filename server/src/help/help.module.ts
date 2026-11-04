import { Module } from '@nestjs/common';
import { HelpClientService } from './help-client.service';
import { HelpCommentsController, HelpController } from './help.controller';

/**
 * This site's window onto the shared help center. Copied per venture with one
 * line changed (`HELP_VENTURE`). `com_mucciandco_help/README.md` has the steps.
 */
@Module({
  controllers: [HelpController, HelpCommentsController],
  providers: [HelpClientService],
})
export class HelpModule {}
