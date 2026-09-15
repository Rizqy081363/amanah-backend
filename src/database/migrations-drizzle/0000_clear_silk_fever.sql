CREATE TABLE "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" varchar(2048) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"hash" varchar(255) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"deletedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "status" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255),
	"password" varchar(255),
	"provider" varchar(50) DEFAULT 'email' NOT NULL,
	"socialId" varchar(255),
	"firstName" varchar(255),
	"lastName" varchar(255),
	"photoId" uuid,
	"roleId" integer,
	"statusId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"deletedAt" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_photoId_file_id_fk" FOREIGN KEY ("photoId") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_roleId_role_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_statusId_status_id_fk" FOREIGN KEY ("statusId") REFERENCES "public"."status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_session_user_id" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_user_social_id" ON "user" USING btree ("socialId");--> statement-breakpoint
CREATE INDEX "idx_user_first_name" ON "user" USING btree ("firstName");--> statement-breakpoint
CREATE INDEX "idx_user_last_name" ON "user" USING btree ("lastName");