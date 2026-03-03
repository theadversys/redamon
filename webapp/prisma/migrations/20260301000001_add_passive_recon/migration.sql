-- Add passive recon mode flag to projects
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "passive_recon_only" BOOLEAN NOT NULL DEFAULT false;
