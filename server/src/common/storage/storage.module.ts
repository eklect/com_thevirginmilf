import { Global, Module } from '@nestjs/common';
import { FileStorageService } from './file-storage.service';

/**
 * Global so every module that stores or serves files gets
 * the same configured instance, rather than each constructing its own view of
 * where the root is.
 */
@Global()
@Module({
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class StorageModule {}
