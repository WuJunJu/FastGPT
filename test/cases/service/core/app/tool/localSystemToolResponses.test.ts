import { describe, expect, it } from 'vitest';
import {
  summarizeExecToolResponse,
  summarizeListFilesToolResponse,
  summarizeReadFileToolResponse,
  summarizeWriteFileToolResponse
} from '@fastgpt/service/core/app/tool/localSystemToolResponses';

describe('localSystemToolResponses', () => {
  it('returns plain stdout for successful exec responses', () => {
    const result = summarizeExecToolResponse({
      argv: ['python3', '-V'],
      exitCode: 0,
      timedOut: false,
      stdout: 'Python 3.12.3\n',
      stderr: ''
    });

    expect(result).toBe('Python 3.12.3');
  });

  it('keeps error context for failing exec responses', () => {
    const result = summarizeExecToolResponse({
      command: 'python3 bad.py',
      exitCode: 1,
      timedOut: false,
      stdout: '',
      stderr: 'Traceback...'
    });

    expect(result).toContain('Command: python3 bad.py');
    expect(result).toContain('Exit code: 1');
    expect(result).toContain('Stderr:\nTraceback...');
  });

  it('does not expose base64 when summarizing read-file responses', () => {
    const result = summarizeReadFileToolResponse({
      path: 'input/demo.txt',
      sizeBytes: 5,
      truncated: false,
      contentText: 'hello'
    });

    expect(result).toBe('File input/demo.txt:\nhello');
  });

  it('formats directory listings as concise text', () => {
    const result = summarizeListFilesToolResponse({
      path: 'input',
      entries: [
        { path: 'input/subdir', is_dir: true },
        { path: 'input/a.txt', is_dir: false, size_bytes: 12 }
      ]
    });

    expect(result).toContain('Directory input:');
    expect(result).toContain('[dir] input/subdir');
    expect(result).toContain('[file] input/a.txt (12 bytes)');
  });

  it('summarizes file writes without leaking raw payloads', () => {
    const result = summarizeWriteFileToolResponse({
      path: 'src/main.py',
      uploaded: [{ path: 'src/main.py' }],
      degraded: false
    });

    expect(result).toBe('Wrote src/main.py.');
  });
});
