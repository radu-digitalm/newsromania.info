import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_site_config_ad_networks_ad_unit_ids_slot" ADD VALUE 'article-end' BEFORE 'rail';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_config_ad_networks_ad_unit_ids" ALTER COLUMN "slot" SET DATA TYPE text;
  DROP TYPE "public"."enum_site_config_ad_networks_ad_unit_ids_slot";
  CREATE TYPE "public"."enum_site_config_ad_networks_ad_unit_ids_slot" AS ENUM('feed', 'article', 'rail', 'leaderboard');
  ALTER TABLE "site_config_ad_networks_ad_unit_ids" ALTER COLUMN "slot" SET DATA TYPE "public"."enum_site_config_ad_networks_ad_unit_ids_slot" USING "slot"::"public"."enum_site_config_ad_networks_ad_unit_ids_slot";`)
}
