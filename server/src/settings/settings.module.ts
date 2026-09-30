import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PageSettingEntity } from './page-setting.entity';
import { SettingsService } from './settings.service';
import { SiteSettingEntity } from './site-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SiteSettingEntity, PageSettingEntity])],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
