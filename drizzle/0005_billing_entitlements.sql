CREATE TABLE "entitlements" (
	"device_id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"subscription_id" text,
	"status" text DEFAULT 'inactive' NOT NULL,
	"price_id" text,
	"current_period_end" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entitlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "entitlements_customer_idx" ON "entitlements" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "entitlements_subscription_idx" ON "entitlements" USING btree ("subscription_id");