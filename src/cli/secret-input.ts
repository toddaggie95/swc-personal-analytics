import { SafeError } from '../config/index.js';

/** Do not accept secrets in argv, shell history, or an echoed readline prompt. */
export async function secretInput(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || !process.stdout.isTTY) throw new SafeError('Run this command in an interactive terminal for hidden input.');
  process.stdout.write(prompt);
  const wasRaw = input.isRaw;
  input.setRawMode(true); input.resume(); input.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const done = () => { input.off('data', onData); input.setRawMode(wasRaw); input.pause(); process.stdout.write('\n'); };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\u0003') { done(); reject(new SafeError('Cancelled.')); return; }
        if (ch === '\r' || ch === '\n') { done(); resolve(value.trim()); return; }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ' && value.length < 4096) value += ch;
      }
    };
    input.on('data', onData);
  });
}
