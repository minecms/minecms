CREATE TABLE "media_assets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"original_filename" varchar(512) NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"size" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"sha1" varchar(40) NOT NULL,
	"alt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key")
);
