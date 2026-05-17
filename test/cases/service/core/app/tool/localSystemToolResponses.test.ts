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

    expect(result).toContain('exit 1');
    expect(result).toContain('Traceback...');
  });

  it('tells the agent to continue or stop when a command is still running', () => {
    const result = summarizeExecToolResponse({
      running: true,
      completed: false,
      outputText: 'build step 1\nbuild step 2',
      actionHint: 'Call Continue Command to wait longer or Stop Command to terminate it.'
    });

    expect(result).toContain('still running');
    expect(result).toContain('build step 1');
    expect(result).toContain('Continue Command');
  });

  it('does not expose base64 when summarizing read-file responses', () => {
    const result = summarizeReadFileToolResponse({
      path: 'input/demo.txt',
      sizeBytes: 5,
      truncated: false,
      contentText: 'hello'
    });

    expect(result).toBe('Read input/demo.txt (5 B)\nhello');
  });

  it('formats directory listings as concise text', () => {
    const result = summarizeListFilesToolResponse({
      path: 'input',
      entries: [
        { path: 'input/subdir', is_dir: true },
        { path: 'input/a.txt', is_dir: false, size_bytes: 12 }
      ]
    });

    expect(result).toContain('input: 1 file, 1 dir');
    expect(result).toContain('input/subdir/');
    expect(result).toContain('input/a.txt');
  });

  it('summarizes file writes without leaking raw payloads', () => {
    const result = summarizeWriteFileToolResponse({
      path: 'src/main.py',
      uploaded: [{ path: 'src/main.py' }],
      degraded: false
    });

    expect(result).toBe('Wrote src/main.py');
  });
});
