#!/bin/sh
set -e
FILE=/app/dist/engine/adapters/whatsapp-web-js.adapter.js
echo "[PATCH] Patching $FILE..."

ls -la "$FILE"

# Change sendMediaMessage signature to accept isAudio and asDocument params
sed -i 's/async sendMediaMessage(chatId, media) {/async sendMediaMessage(chatId, media, isAudio = false) {/' "$FILE"
sed -i 's/async sendMediaMessage(chatId, media, isAudio = false) {/async sendMediaMessage(chatId, media, isAudio = false, asDocument = false) {/' "$FILE"
echo "[PATCH] sendMediaMessage signature changed (isAudio + asDocument)"

# Change sendAudioMessage body to pass isAudio=true
sed -i '/async sendAudioMessage/{n;s/return this.sendMediaMessage(chatId, media);/return this.sendMediaMessage(chatId, media, true);/}' "$FILE"
echo "[PATCH] sendAudioMessage passes isAudio=true"

# Change sendDocumentMessage body to pass asDocument=true
sed -i '/async sendDocumentMessage/{n;s/return this.sendMediaMessage(chatId, media);/return this.sendMediaMessage(chatId, media, false, true);/}' "$FILE"
echo "[PATCH] sendDocumentMessage passes asDocument=true"

# Add sendAudioAsVoice to the sendMessage options
sed -i 's/caption: media.caption,/caption: media.caption,\n            sendAudioAsVoice: isAudio,/' "$FILE"
echo "[PATCH] sendAudioAsVoice option added"

# Add sendMediaAsDocument to the sendMessage options
sed -i 's/sendAudioAsVoice: isAudio,/sendAudioAsVoice: isAudio,\n            sendMediaAsDocument: asDocument,/' "$FILE"
echo "[PATCH] sendMediaAsDocument option added"

# Verify
grep -n 'sendAudioAsVoice\|sendMediaAsDocument\|isAudio\|asDocument\|sendAudioMessage\|sendDocumentMessage\|sendMediaMessage' "$FILE"
echo "[PATCH] Done"
