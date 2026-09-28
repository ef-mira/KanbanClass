-- Hand-simplified from Prisma's table rebuild: adding a column with a default needs no copy.
ALTER TABLE "UserSettings" ADD COLUMN "weekDays" INTEGER NOT NULL DEFAULT 5;
