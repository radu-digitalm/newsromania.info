import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'editor', 'author');
  CREATE TYPE "public"."enum_articles_seo_seo_score" AS ENUM('green', 'amber', 'red', 'unscored');
  CREATE TYPE "public"."enum_articles_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_version_seo_seo_score" AS ENUM('green', 'amber', 'red', 'unscored');
  CREATE TYPE "public"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_feeds_excerpt_policy" AS ENUM('link-only', 'ai-excerpt');
  CREATE TYPE "public"."enum_consent_records_choice" AS ENUM('accepted', 'refused', 'withdrawn');
  CREATE TYPE "public"."enum_cdp_events_type" AS ENUM('page_view', 'article_click', 'scroll_depth', 'time_on_page', 'category_read', 'ad_impression', 'ad_click');
  CREATE TYPE "public"."enum_cdp_profiles_consent_state" AS ENUM('accepted', 'refused', 'withdrawn', 'unknown');
  CREATE TYPE "public"."enum_social_queue_content_type" AS ENUM('original', 'aggregated');
  CREATE TYPE "public"."enum_social_queue_platform" AS ENUM('facebook', 'instagram', 'twitter');
  CREATE TYPE "public"."enum_social_queue_status" AS ENUM('queued', 'approved', 'posted', 'skipped');
  CREATE TYPE "public"."enum_llm_usage_purpose" AS ENUM('summarize', 'categorize', 'captions', 'seed');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TYPE "public"."enum_site_config_ad_networks_ad_unit_ids_slot" AS ENUM('feed', 'article', 'rail', 'leaderboard');
  CREATE TYPE "public"."enum_site_config_social_platforms_page_urls_platform" AS ENUM('facebook', 'instagram', 'twitter');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" "enum_users_role" DEFAULT 'author' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_hero_url" varchar,
  	"sizes_hero_width" numeric,
  	"sizes_hero_height" numeric,
  	"sizes_hero_mime_type" varchar,
  	"sizes_hero_filesize" numeric,
  	"sizes_hero_filename" varchar
  );
  
  CREATE TABLE "articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"category_id" integer,
  	"author_id" integer,
  	"excerpt" varchar,
  	"body" jsonb,
  	"featured_image_id" integer,
  	"seo_meta_title" varchar,
  	"seo_meta_description" varchar,
  	"seo_focus_keyword" varchar,
  	"seo_seo_score" "enum_articles_seo_seo_score" DEFAULT 'unscored',
  	"seo_seo_report" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_articles_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "articles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "_articles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_category_id" integer,
  	"version_author_id" integer,
  	"version_excerpt" varchar,
  	"version_body" jsonb,
  	"version_featured_image_id" integer,
  	"version_seo_meta_title" varchar,
  	"version_seo_meta_description" varchar,
  	"version_seo_focus_keyword" varchar,
  	"version_seo_seo_score" "enum__articles_v_version_seo_seo_score" DEFAULT 'unscored',
  	"version_seo_seo_report" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__articles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_articles_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "aggregated_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"guid" varchar NOT NULL,
  	"source_url" varchar NOT NULL,
  	"source_name" varchar NOT NULL,
  	"source_homepage" varchar,
  	"feed_id" integer,
  	"excerpt" varchar,
  	"link_only" boolean DEFAULT true,
  	"category_id" integer,
  	"image_url" varchar,
  	"image_allowed" boolean DEFAULT false,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"cluster_key" varchar,
  	"content_hash" varchar,
  	"archived" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "aggregated_items_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "feeds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"homepage" varchar,
  	"active" boolean DEFAULT false,
  	"excerpt_policy" "enum_feeds_excerpt_policy" DEFAULT 'link-only' NOT NULL,
  	"default_category_id" integer,
  	"poll_minutes" numeric DEFAULT 30,
  	"last_fetched_at" timestamp(3) with time zone,
  	"last_item_at" timestamp(3) with time zone,
  	"last_error" varchar,
  	"consecutive_failures" numeric DEFAULT 0,
  	"etag" varchar,
  	"http_last_modified" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "consent_records" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"choice" "enum_consent_records_choice" NOT NULL,
  	"ts" timestamp(3) with time zone NOT NULL,
  	"visitor_id" varchar,
  	"ip_hash" varchar,
  	"user_agent" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cdp_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"visitor_id" varchar NOT NULL,
  	"type" "enum_cdp_events_type" NOT NULL,
  	"path" varchar,
  	"article_id" varchar,
  	"category" varchar,
  	"value" numeric,
  	"region" varchar,
  	"ts" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cdp_profiles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"visitor_id" varchar NOT NULL,
  	"interests" jsonb,
  	"last_region" varchar,
  	"last_seen_at" timestamp(3) with time zone,
  	"visits" numeric DEFAULT 0,
  	"consent_state" "enum_cdp_profiles_consent_state" DEFAULT 'unknown',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "social_queue" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"content_type" "enum_social_queue_content_type" NOT NULL,
  	"ref_id" varchar NOT NULL,
  	"platform" "enum_social_queue_platform" NOT NULL,
  	"caption" varchar,
  	"image_url" varchar,
  	"link" varchar,
  	"scheduled_for" timestamp(3) with time zone,
  	"status" "enum_social_queue_status" DEFAULT 'queued' NOT NULL,
  	"posted_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "llm_usage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"day" varchar NOT NULL,
  	"provider" varchar NOT NULL,
  	"model" varchar NOT NULL,
  	"purpose" "enum_llm_usage_purpose" NOT NULL,
  	"input_tokens" numeric DEFAULT 0,
  	"output_tokens" numeric DEFAULT 0,
  	"calls" numeric DEFAULT 0,
  	"est_cost_usd" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"articles_id" integer,
  	"aggregated_items_id" integer,
  	"categories_id" integer,
  	"tags_id" integer,
  	"feeds_id" integer,
  	"consent_records_id" integer,
  	"cdp_events_id" integer,
  	"cdp_profiles_id" integer,
  	"social_queue_id" integer,
  	"llm_usage_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "site_config_ad_networks_ad_unit_ids" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"slot" "enum_site_config_ad_networks_ad_unit_ids_slot" NOT NULL,
  	"unit_id" varchar NOT NULL,
  	"format" varchar
  );
  
  CREATE TABLE "site_config_ad_networks_amazon_partner_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"marketplace" varchar NOT NULL,
  	"tag" varchar NOT NULL
  );
  
  CREATE TABLE "site_config_locale_rules" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"country" varchar NOT NULL,
  	"region" varchar NOT NULL,
  	"ad_set" varchar NOT NULL
  );
  
  CREATE TABLE "site_config_ad_frequency" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"region" varchar NOT NULL,
  	"every_nth" numeric NOT NULL
  );
  
  CREATE TABLE "site_config_social_platforms_page_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "enum_site_config_social_platforms_page_urls_platform" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "site_config_social_platforms_posting_schedule" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"time" varchar NOT NULL
  );
  
  CREATE TABLE "site_config" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ad_networks_ad_sense_publisher_id" varchar,
  	"behavioural_targeting_enabled" boolean DEFAULT true,
  	"behavioural_targeting_requires_consent" boolean DEFAULT true,
  	"gdpr_consent_version" numeric DEFAULT 1,
  	"gdpr_cookie_retention_days" numeric DEFAULT 180,
  	"cdp_retention_days" numeric DEFAULT 365,
  	"editorial_seo_language" varchar DEFAULT 'ro',
  	"editorial_min_word_count" numeric DEFAULT 300,
  	"editorial_block_publish_on_red" boolean DEFAULT false,
  	"aggregation_item_ttl_days" numeric DEFAULT 14,
  	"aggregation_front_page_max_age_hours" numeric DEFAULT 72,
  	"aggregation_max_summaries_per_run" numeric DEFAULT 40,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_featured_image_id_media_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_category_id_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_featured_image_id_media_id_fk" FOREIGN KEY ("version_featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "aggregated_items" ADD CONSTRAINT "aggregated_items_feed_id_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feeds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "aggregated_items" ADD CONSTRAINT "aggregated_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "aggregated_items_rels" ADD CONSTRAINT "aggregated_items_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."aggregated_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "aggregated_items_rels" ADD CONSTRAINT "aggregated_items_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "feeds" ADD CONSTRAINT "feeds_default_category_id_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_aggregated_items_fk" FOREIGN KEY ("aggregated_items_id") REFERENCES "public"."aggregated_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_feeds_fk" FOREIGN KEY ("feeds_id") REFERENCES "public"."feeds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_consent_records_fk" FOREIGN KEY ("consent_records_id") REFERENCES "public"."consent_records"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cdp_events_fk" FOREIGN KEY ("cdp_events_id") REFERENCES "public"."cdp_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cdp_profiles_fk" FOREIGN KEY ("cdp_profiles_id") REFERENCES "public"."cdp_profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_queue_fk" FOREIGN KEY ("social_queue_id") REFERENCES "public"."social_queue"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_llm_usage_fk" FOREIGN KEY ("llm_usage_id") REFERENCES "public"."llm_usage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_config_ad_networks_ad_unit_ids" ADD CONSTRAINT "site_config_ad_networks_ad_unit_ids_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_config_ad_networks_amazon_partner_tags" ADD CONSTRAINT "site_config_ad_networks_amazon_partner_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_config_locale_rules" ADD CONSTRAINT "site_config_locale_rules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_config_ad_frequency" ADD CONSTRAINT "site_config_ad_frequency_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_config_social_platforms_page_urls" ADD CONSTRAINT "site_config_social_platforms_page_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_config_social_platforms_posting_schedule" ADD CONSTRAINT "site_config_social_platforms_posting_schedule_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_hero_sizes_hero_filename_idx" ON "media" USING btree ("sizes_hero_filename");
  CREATE UNIQUE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");
  CREATE INDEX "articles_category_idx" ON "articles" USING btree ("category_id");
  CREATE INDEX "articles_author_idx" ON "articles" USING btree ("author_id");
  CREATE INDEX "articles_featured_image_idx" ON "articles" USING btree ("featured_image_id");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "articles__status_idx" ON "articles" USING btree ("_status");
  CREATE INDEX "articles_rels_order_idx" ON "articles_rels" USING btree ("order");
  CREATE INDEX "articles_rels_parent_idx" ON "articles_rels" USING btree ("parent_id");
  CREATE INDEX "articles_rels_path_idx" ON "articles_rels" USING btree ("path");
  CREATE INDEX "articles_rels_tags_id_idx" ON "articles_rels" USING btree ("tags_id");
  CREATE INDEX "_articles_v_parent_idx" ON "_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_slug_idx" ON "_articles_v" USING btree ("version_slug");
  CREATE INDEX "_articles_v_version_version_category_idx" ON "_articles_v" USING btree ("version_category_id");
  CREATE INDEX "_articles_v_version_version_author_idx" ON "_articles_v" USING btree ("version_author_id");
  CREATE INDEX "_articles_v_version_version_featured_image_idx" ON "_articles_v" USING btree ("version_featured_image_id");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_version_version__status_idx" ON "_articles_v" USING btree ("version__status");
  CREATE INDEX "_articles_v_created_at_idx" ON "_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_latest_idx" ON "_articles_v" USING btree ("latest");
  CREATE INDEX "_articles_v_autosave_idx" ON "_articles_v" USING btree ("autosave");
  CREATE INDEX "_articles_v_rels_order_idx" ON "_articles_v_rels" USING btree ("order");
  CREATE INDEX "_articles_v_rels_parent_idx" ON "_articles_v_rels" USING btree ("parent_id");
  CREATE INDEX "_articles_v_rels_path_idx" ON "_articles_v_rels" USING btree ("path");
  CREATE INDEX "_articles_v_rels_tags_id_idx" ON "_articles_v_rels" USING btree ("tags_id");
  CREATE UNIQUE INDEX "aggregated_items_slug_idx" ON "aggregated_items" USING btree ("slug");
  CREATE UNIQUE INDEX "aggregated_items_guid_idx" ON "aggregated_items" USING btree ("guid");
  CREATE INDEX "aggregated_items_feed_idx" ON "aggregated_items" USING btree ("feed_id");
  CREATE INDEX "aggregated_items_category_idx" ON "aggregated_items" USING btree ("category_id");
  CREATE INDEX "aggregated_items_published_at_idx" ON "aggregated_items" USING btree ("published_at");
  CREATE INDEX "aggregated_items_cluster_key_idx" ON "aggregated_items" USING btree ("cluster_key");
  CREATE INDEX "aggregated_items_archived_idx" ON "aggregated_items" USING btree ("archived");
  CREATE INDEX "aggregated_items_updated_at_idx" ON "aggregated_items" USING btree ("updated_at");
  CREATE INDEX "aggregated_items_created_at_idx" ON "aggregated_items" USING btree ("created_at");
  CREATE INDEX "aggregated_items_rels_order_idx" ON "aggregated_items_rels" USING btree ("order");
  CREATE INDEX "aggregated_items_rels_parent_idx" ON "aggregated_items_rels" USING btree ("parent_id");
  CREATE INDEX "aggregated_items_rels_path_idx" ON "aggregated_items_rels" USING btree ("path");
  CREATE INDEX "aggregated_items_rels_tags_id_idx" ON "aggregated_items_rels" USING btree ("tags_id");
  CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "tags_slug_idx" ON "tags" USING btree ("slug");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "feeds_url_idx" ON "feeds" USING btree ("url");
  CREATE INDEX "feeds_default_category_idx" ON "feeds" USING btree ("default_category_id");
  CREATE INDEX "feeds_updated_at_idx" ON "feeds" USING btree ("updated_at");
  CREATE INDEX "feeds_created_at_idx" ON "feeds" USING btree ("created_at");
  CREATE INDEX "consent_records_updated_at_idx" ON "consent_records" USING btree ("updated_at");
  CREATE INDEX "consent_records_created_at_idx" ON "consent_records" USING btree ("created_at");
  CREATE INDEX "cdp_events_visitor_id_idx" ON "cdp_events" USING btree ("visitor_id");
  CREATE INDEX "cdp_events_ts_idx" ON "cdp_events" USING btree ("ts");
  CREATE INDEX "cdp_events_updated_at_idx" ON "cdp_events" USING btree ("updated_at");
  CREATE INDEX "cdp_events_created_at_idx" ON "cdp_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "cdp_profiles_visitor_id_idx" ON "cdp_profiles" USING btree ("visitor_id");
  CREATE INDEX "cdp_profiles_updated_at_idx" ON "cdp_profiles" USING btree ("updated_at");
  CREATE INDEX "cdp_profiles_created_at_idx" ON "cdp_profiles" USING btree ("created_at");
  CREATE INDEX "social_queue_ref_id_idx" ON "social_queue" USING btree ("ref_id");
  CREATE INDEX "social_queue_scheduled_for_idx" ON "social_queue" USING btree ("scheduled_for");
  CREATE INDEX "social_queue_updated_at_idx" ON "social_queue" USING btree ("updated_at");
  CREATE INDEX "social_queue_created_at_idx" ON "social_queue" USING btree ("created_at");
  CREATE INDEX "llm_usage_day_idx" ON "llm_usage" USING btree ("day");
  CREATE INDEX "llm_usage_updated_at_idx" ON "llm_usage" USING btree ("updated_at");
  CREATE INDEX "llm_usage_created_at_idx" ON "llm_usage" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_aggregated_items_id_idx" ON "payload_locked_documents_rels" USING btree ("aggregated_items_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_feeds_id_idx" ON "payload_locked_documents_rels" USING btree ("feeds_id");
  CREATE INDEX "payload_locked_documents_rels_consent_records_id_idx" ON "payload_locked_documents_rels" USING btree ("consent_records_id");
  CREATE INDEX "payload_locked_documents_rels_cdp_events_id_idx" ON "payload_locked_documents_rels" USING btree ("cdp_events_id");
  CREATE INDEX "payload_locked_documents_rels_cdp_profiles_id_idx" ON "payload_locked_documents_rels" USING btree ("cdp_profiles_id");
  CREATE INDEX "payload_locked_documents_rels_social_queue_id_idx" ON "payload_locked_documents_rels" USING btree ("social_queue_id");
  CREATE INDEX "payload_locked_documents_rels_llm_usage_id_idx" ON "payload_locked_documents_rels" USING btree ("llm_usage_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "site_config_ad_networks_ad_unit_ids_order_idx" ON "site_config_ad_networks_ad_unit_ids" USING btree ("_order");
  CREATE INDEX "site_config_ad_networks_ad_unit_ids_parent_id_idx" ON "site_config_ad_networks_ad_unit_ids" USING btree ("_parent_id");
  CREATE INDEX "site_config_ad_networks_amazon_partner_tags_order_idx" ON "site_config_ad_networks_amazon_partner_tags" USING btree ("_order");
  CREATE INDEX "site_config_ad_networks_amazon_partner_tags_parent_id_idx" ON "site_config_ad_networks_amazon_partner_tags" USING btree ("_parent_id");
  CREATE INDEX "site_config_locale_rules_order_idx" ON "site_config_locale_rules" USING btree ("_order");
  CREATE INDEX "site_config_locale_rules_parent_id_idx" ON "site_config_locale_rules" USING btree ("_parent_id");
  CREATE INDEX "site_config_ad_frequency_order_idx" ON "site_config_ad_frequency" USING btree ("_order");
  CREATE INDEX "site_config_ad_frequency_parent_id_idx" ON "site_config_ad_frequency" USING btree ("_parent_id");
  CREATE INDEX "site_config_social_platforms_page_urls_order_idx" ON "site_config_social_platforms_page_urls" USING btree ("_order");
  CREATE INDEX "site_config_social_platforms_page_urls_parent_id_idx" ON "site_config_social_platforms_page_urls" USING btree ("_parent_id");
  CREATE INDEX "site_config_social_platforms_posting_schedule_order_idx" ON "site_config_social_platforms_posting_schedule" USING btree ("_order");
  CREATE INDEX "site_config_social_platforms_posting_schedule_parent_id_idx" ON "site_config_social_platforms_posting_schedule" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "articles_rels" CASCADE;
  DROP TABLE "_articles_v" CASCADE;
  DROP TABLE "_articles_v_rels" CASCADE;
  DROP TABLE "aggregated_items" CASCADE;
  DROP TABLE "aggregated_items_rels" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "feeds" CASCADE;
  DROP TABLE "consent_records" CASCADE;
  DROP TABLE "cdp_events" CASCADE;
  DROP TABLE "cdp_profiles" CASCADE;
  DROP TABLE "social_queue" CASCADE;
  DROP TABLE "llm_usage" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "site_config_ad_networks_ad_unit_ids" CASCADE;
  DROP TABLE "site_config_ad_networks_amazon_partner_tags" CASCADE;
  DROP TABLE "site_config_locale_rules" CASCADE;
  DROP TABLE "site_config_ad_frequency" CASCADE;
  DROP TABLE "site_config_social_platforms_page_urls" CASCADE;
  DROP TABLE "site_config_social_platforms_posting_schedule" CASCADE;
  DROP TABLE "site_config" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_articles_seo_seo_score";
  DROP TYPE "public"."enum_articles_status";
  DROP TYPE "public"."enum__articles_v_version_seo_seo_score";
  DROP TYPE "public"."enum__articles_v_version_status";
  DROP TYPE "public"."enum_feeds_excerpt_policy";
  DROP TYPE "public"."enum_consent_records_choice";
  DROP TYPE "public"."enum_cdp_events_type";
  DROP TYPE "public"."enum_cdp_profiles_consent_state";
  DROP TYPE "public"."enum_social_queue_content_type";
  DROP TYPE "public"."enum_social_queue_platform";
  DROP TYPE "public"."enum_social_queue_status";
  DROP TYPE "public"."enum_llm_usage_purpose";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  DROP TYPE "public"."enum_site_config_ad_networks_ad_unit_ids_slot";
  DROP TYPE "public"."enum_site_config_social_platforms_page_urls_platform";`)
}
