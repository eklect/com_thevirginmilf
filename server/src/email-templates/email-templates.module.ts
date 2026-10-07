import { Global, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ServiceAuthModule } from '../service-auth/service-auth.module';
import { EmailImagesController } from './email-images.controller';
import { EmailImagesService } from './email-images.service';
import { EmailTemplatesConfig } from './email-templates.config';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';
import { FileTemplateService } from './file-template.service';
import { GitSyncService } from './git-sync.service';

/**
 * The venture's half of the Email Templates tool: the files in the
 * `muccico_email_templates` submodule, the service plane the app calls, and
 * `FileTemplateService`, which the mail module's callers use to send from
 * those files.
 *
 * Global so any feature can inject `FileTemplateService` without importing
 * the module, the same way `MailModule` is. Multer is registered here, with
 * memory storage and this module's own cap, for the one upload route — not
 * exported, so it cannot capture another module's interceptor.
 */
@Global()
@Module({
  imports: [
    ServiceAuthModule,
    MulterModule.registerAsync({
      inject: [EmailTemplatesConfig],
      useFactory: (config: EmailTemplatesConfig) => ({
        storage: memoryStorage(),
        limits: { fileSize: config.imageMaxBytes, files: 1, fields: 2, parts: 4, fieldSize: 4096 },
      }),
    }),
  ],
  controllers: [EmailTemplatesController, EmailImagesController],
  providers: [EmailTemplatesConfig, GitSyncService, EmailTemplatesService, EmailImagesService, FileTemplateService],
  exports: [FileTemplateService, EmailTemplatesConfig],
})
export class EmailTemplatesModule {}
