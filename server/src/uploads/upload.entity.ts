import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * `uploads` — one row per file on disk.
 *
 * A game's cover, a screenshot or the site logo points at one of these by id.
 * `UploadsService.remove` refuses while anything still does.
 */
@Entity('uploads')
export class UploadEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  /** Relative to `STORAGE_ROOT`, e.g. `images/<id>.png`. */
  @Index('ux_uploads_storage_key', { unique: true })
  @Column({ name: 'storage_key', type: 'varchar', length: 255 })
  storageKey!: string;

  /** Sniffed from the bytes, never taken from the client. */
  @Column({ name: 'mime_type', type: 'varchar', length: 64 })
  mimeType!: string;

  @Column({ name: 'byte_size', type: 'int' })
  byteSize!: number;

  /** For the admin's benefit only; never a path component. */
  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  originalFilename!: string;

  @Column({ type: 'char', length: 64 })
  sha256!: string;

  /** MAP `sub` of the admin who uploaded it. */
  @Column({ name: 'created_by', type: 'varchar', length: 64 })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;
}
