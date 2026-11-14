-- CreateTable
CREATE TABLE IF NOT EXISTS "McpConnector" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpConnector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "McpConnector_userId_url_key" ON "McpConnector"("userId", "url");
CREATE INDEX IF NOT EXISTS "McpConnector_userId_idx" ON "McpConnector"("userId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "PluginInstall" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginInstall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PluginInstall_userId_pluginId_key" ON "PluginInstall"("userId", "pluginId");
CREATE INDEX IF NOT EXISTS "PluginInstall_userId_idx" ON "PluginInstall"("userId");

-- AddForeignKey
ALTER TABLE "McpConnector" ADD CONSTRAINT "McpConnector_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PluginInstall" ADD CONSTRAINT "PluginInstall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
