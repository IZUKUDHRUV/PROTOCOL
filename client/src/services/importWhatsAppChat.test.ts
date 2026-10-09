import { describe, expect, it } from 'vitest';
import { parseWhatsAppExport } from './importWhatsAppChat';

function textFile(content: string, size = new TextEncoder().encode(content).length) {
  return { size, text: async () => content } as File;
}

describe('WhatsApp text export import', () => {
  it('parses timestamped messages and keeps multiline content with the sender', async () => {
    const result = await parseWhatsAppExport(textFile(
      '[10/9/26, 10:20 AM] - Jamie: First line\ncontinued here\n10/9/26, 10:25 AM - Pat: Next message',
    ));

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ sender: 'Jamie', timestamp: '10/9/26, 10:20 AM', text: 'First line\ncontinued here' });
    expect(result[1]?.sender).toBe('Pat');
  });

  it('rejects oversized and unrecognized files', async () => {
    await expect(parseWhatsAppExport(textFile('', 1_000_001))).rejects.toThrow('larger than 1 MB');
    await expect(parseWhatsAppExport(textFile('not a chat export'))).rejects.toThrow('No text messages were recognized');
  });
});
