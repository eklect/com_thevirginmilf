import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from './filters/http-exception.filter';

/**
 * The request pipeline — cookies, validation and error shaping — in one place.
 *
 * `forbidNonWhitelisted` is on, unlike the product API. This app has a small,
 * hand-written admin client that sends exactly what the DTOs declare, so an
 * unexpected key is a bug worth a 400 rather than something to strip quietly.
 */
export function applyAppPipeline(app: INestApplication): void {
  // The browser authenticates with a session cookie; without this `req.cookies`
  // is undefined and the guard sees nobody.
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
}
