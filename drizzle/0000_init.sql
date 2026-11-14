CREATE TYPE "public"."flashcard_status" AS ENUM('published', 'flagged', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."flashcard_tone" AS ENUM('fun', 'fact', 'deep');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."testament" AS ENUM('OT', 'NT');--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "flashcard_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flashcard_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flashcard_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "flashcards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"explanation" text,
	"category" text NOT NULL,
	"tone" "flashcard_tone" NOT NULL,
	"difficulty" smallint DEFAULT 1 NOT NULL,
	"refs" text[] NOT NULL,
	"author_id" uuid,
	"status" "flashcard_status" DEFAULT 'published' NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, question || ' ' || answer || ' ' || coalesce(explanation, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flashcards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "flashcards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" "message_role" NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verses" (
	"translation" text NOT NULL,
	"id" text NOT NULL,
	"book" text NOT NULL,
	"book_order" smallint NOT NULL,
	"testament" "testament" NOT NULL,
	"chapter" smallint NOT NULL,
	"verse" smallint NOT NULL,
	"text" text NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, text)) STORED,
	CONSTRAINT "verses_translation_id_pk" PRIMARY KEY("translation","id")
);
--> statement-breakpoint
ALTER TABLE "verses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_reports" ADD CONSTRAINT "flashcard_reports_flashcard_id_flashcards_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_reports" ADD CONSTRAINT "flashcard_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chats_user_updated_idx" ON "chats" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "flashcard_reports_once_idx" ON "flashcard_reports" USING btree ("flashcard_id","user_id");--> statement-breakpoint
CREATE INDEX "flashcards_search_idx" ON "flashcards" USING gin ("search");--> statement-breakpoint
CREATE INDEX "flashcards_category_idx" ON "flashcards" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_chat_seq_idx" ON "messages" USING btree ("chat_id","seq");--> statement-breakpoint
CREATE INDEX "verses_order_idx" ON "verses" USING btree ("translation","book_order","chapter","verse");--> statement-breakpoint
CREATE INDEX "verses_search_idx" ON "verses" USING gin ("search");--> statement-breakpoint
CREATE POLICY "chats: owner only" ON "chats" AS PERMISSIVE FOR ALL TO "authenticated" USING ("chats"."user_id" = (select auth.uid())) WITH CHECK ("chats"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "reports: insert own" ON "flashcard_reports" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("flashcard_reports"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "flashcards: public read" ON "flashcards" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ("flashcards"."status" = 'published');--> statement-breakpoint
CREATE POLICY "flashcards: authors insert" ON "flashcards" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("flashcards"."author_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "flashcards: authors update" ON "flashcards" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("flashcards"."author_id" = (select auth.uid())) WITH CHECK ("flashcards"."author_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "messages: via owned chat" ON "messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from chats c where c.id = "messages"."chat_id" and c.user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "profiles: read own" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("profiles"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "profiles: update own" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("profiles"."id" = (select auth.uid())) WITH CHECK ("profiles"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "verses: public read" ON "verses" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);