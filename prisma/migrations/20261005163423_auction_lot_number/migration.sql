-- Public catalogue number for auctions ("Lot 014"), assigned in creation order.
-- SERIAL backfills existing rows in physical order.
ALTER TABLE "Auction" ADD COLUMN "lotNumber" SERIAL NOT NULL;

CREATE UNIQUE INDEX "Auction_lotNumber_key" ON "Auction"("lotNumber");
