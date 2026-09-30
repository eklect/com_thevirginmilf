import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { SubscribersModule } from '../subscribers/subscribers.module';
import { RegisterController } from './register.controller';
import { RegisterService } from './register.service';

@Module({
  imports: [SettingsModule, SubscribersModule],
  controllers: [RegisterController],
  providers: [RegisterService],
})
export class RegisterModule {}
