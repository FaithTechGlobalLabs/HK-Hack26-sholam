CREATE TABLE "usage_counters" (
	"subject" text NOT NULL,
	"period" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_subject_period_pk" PRIMARY KEY("subject","period")
);
--> statement-breakpoint
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "usage_counters_updated_idx" ON "usage_counters" USING btree ("updated_at");