ALTER TABLE "rate_limit" ALTER COLUMN "last_request" SET DATA TYPE bigint USING (extract(epoch from "last_request") * 1000)::bigint;
