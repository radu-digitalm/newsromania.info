import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" ADD COLUMN "published_at" timestamp(3) with time zone;
  ALTER TABLE "_articles_v" ADD COLUMN "version_published_at" timestamp(3) with time zone;
  CREATE INDEX "articles_published_at_idx" ON "articles" USING btree ("published_at");
  CREATE INDEX "_articles_v_version_version_published_at_idx" ON "_articles_v" USING btree ("version_published_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "articles_published_at_idx";
  DROP INDEX "_articles_v_version_version_published_at_idx";
  ALTER TABLE "articles" DROP COLUMN "published_at";
  ALTER TABLE "_articles_v" DROP COLUMN "version_published_at";`)
}
