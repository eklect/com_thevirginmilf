import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { applyAppPipeline } from './common/validation';

async function bootstrap() {
  // `bodyParser: false`: the parsers are registered in applyAppPipeline with a
  // 512 KB JSON limit (Nest's default keeps Express's 100 KB, which an HTML
  // email template exceeds), matching ModSecurity's non-file body cap.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    bodyParser: false,
  });

  applyAppPipeline(app);

  // nginx is the only thing in front of this process, on the same host. Trusting
  // exactly one loopback hop is what makes `request.protocol` read `https` and
  // `request.ip` read the visitor rather than 127.0.0.1 — both of which the
  // auth controller relies on to pick the registered callback URL.
  app.set('trust proxy', 'loopback');
  app.enableShutdownHooks();

  // nginx reverse-proxies https://thevirginmilf.test/api/* to 127.0.0.1:$PORT with
  // the /api prefix stripped, so routes here live at the root and the app MUST
  // bind to loopback (the nginx upstream address). No CORS: same origin.
  const port = parseInt(process.env.PORT ?? '3012', 10);
  await app.listen(port, '127.0.0.1');
  console.log(`The Virgin MILF API listening on 127.0.0.1:${port}`);
}
void bootstrap();
