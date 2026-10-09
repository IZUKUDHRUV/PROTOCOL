import type { CatchUpMessage } from '../types';

const MAX_IMPORT_BYTES = 1_000_000;
const MESSAGE_START = /^\[?(\d{1,4}[/-]\d{1,2}[/-]\d{1,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\]?\s+-\s+([^:]+):\s?(.*)$/i;

export async function parseWhatsAppExport(file: File): Promise<CatchUpMessage[]> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error('That export is larger than 1 MB. Choose a smaller text export.');
  }

  const content = await file.text();
  const messages: CatchUpMessage[] = [];

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(MESSAGE_START);
    if (match) {
      messages.push({
        id: `import-${messages.length}`,
        timestamp: match[1].trim(),
        sender: match[2].trim(),
        text: match[3].trim(),
      });
      continue;
    }

    if (messages.length > 0 && line.trim()) {
      const prev = messages[messages.length - 1];
      prev.text = `${prev.text}\n${line.trim()}`;
    }
  }

  if (!messages.length) {
    throw new Error('No text messages were recognized. Choose a WhatsApp .txt export with timestamps and sender names.');
  }

  return messages;
}
