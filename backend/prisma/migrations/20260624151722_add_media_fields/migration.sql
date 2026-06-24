-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatId" INTEGER NOT NULL,
    "senderWhatsappId" TEXT NOT NULL DEFAULT '',
    "senderName" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentId" INTEGER,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "isFromAgent" BOOLEAN NOT NULL DEFAULT false,
    "mediaUrl" TEXT,
    "mediaMimeType" TEXT,
    "mediaFilename" TEXT,
    "mediaSize" INTEGER,
    CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Message_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("agentId", "body", "chatId", "id", "isFromAgent", "messageType", "senderName", "senderWhatsappId", "timestamp") SELECT "agentId", "body", "chatId", "id", "isFromAgent", "messageType", "senderName", "senderWhatsappId", "timestamp" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
