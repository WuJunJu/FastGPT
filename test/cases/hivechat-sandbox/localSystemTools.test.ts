import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  getLocalSystemTools,
  getLocalSystemToolIds,
  runLocalSystemTool
} from '@fastgpt/service/core/app/tool/localSystemTools';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

describe('runLocalSystemTool', () => {
  const contextToken = 'sandbox-token';

  beforeEach(() => {
    fetchMock.mockReset();
    process.env.HIVECHAT_SANDBOX_BRIDGE_URL = 'http://127.0.0.1:3081';
    process.env.HIVECHAT_SANDBOX_BRIDGE_API_KEY = 'bridge-key';
  });

  it('writes contentBase64 without leaking content from previous calls', async () => {
    const { writeFileToolId } = getLocalSystemToolIds();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        path: 'output/test.bin',
        uploaded: [],
        workspace_bytes: 10,
        degraded: false
      })
    });

    const result = await runLocalSystemTool({
      toolId: writeFileToolId,
      inputs: {
        contextToken,
        path: 'output/test.bin',
        contentBase64: 'aGVsbG8='
      }
    });

    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe('http://127.0.0.1:3081/v1/files/write');
    const body = JSON.parse(String(request?.[1]?.body));
    expect(body.contentBase64).toBe('aGVsbG8=');
    expect(body.content).toBeUndefined();
    expect(result.output?.[NodeOutputKeyEnum.rawResponse]).toBeTruthy();
    expect(result.toolResponseForUI).toMatchObject({
      kind: 'sandbox_write_file',
      path: 'output/test.bin'
    });
  });

  it('normalizes workspace root paths when listing files', async () => {
    const { listFilesToolId } = getLocalSystemToolIds();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'session-root',
        path: '',
        workspace_container_path: '/workspace',
        entries: [{ path: 'input', is_dir: true }]
      })
    });

    const result = await runLocalSystemTool({
      toolId: listFilesToolId,
      inputs: {
        contextToken,
        path: '/'
      }
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.path).toBe('');
    expect(result.output?.path).toBe('');
    expect(result.toolResponseForUI).toMatchObject({
      kind: 'sandbox_list_files',
      path: '',
      workspaceContainerPath: '/workspace',
      entries: [{ path: 'input', is_dir: true }]
    });
  });

  it('runs Exec Shell with command only', async () => {
    const { execShellToolId } = getLocalSystemToolIds();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'session-1',
        running: false,
        completed: true,
        exit_code: 0,
        timed_out: false,
        duration_ms: 10,
        stdout: 'ok\n',
        stderr: '',
        workdir: '/workspace'
      })
    });

    await runLocalSystemTool({
      toolId: execShellToolId,
      inputs: {
        contextToken,
        command: 'echo ok'
      }
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.command).toBe('echo ok');
    expect(body.argv).toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3081/v1/exec/start');
  });

  it('runs Exec Args with argv only', async () => {
    const { execArgsToolId } = getLocalSystemToolIds();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'session-2',
        running: false,
        completed: true,
        exit_code: 0,
        timed_out: false,
        duration_ms: 12,
        stdout: 'Python 3.12.3\n',
        stderr: '',
        workdir: '/workspace'
      })
    });

    await runLocalSystemTool({
      toolId: execArgsToolId,
      inputs: {
        contextToken,
        argv: ['python3', '-V']
      }
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.argv).toEqual(['python3', '-V']);
    expect(body.command).toBeUndefined();
  });

  it('returns running snapshots for long Exec Shell commands', async () => {
    const { execShellToolId } = getLocalSystemToolIds();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'session-3',
        running: true,
        completed: false,
        terminal_id: 'exec-123',
        offset: 0,
        next_offset: 42,
        output_text: 'still working\n',
        output_truncated: false,
        preview_truncated: false,
        exit_code: null,
        timed_out: false,
        workdir: '/workspace',
        action_hint: 'Command is still running. Review outputText, then call Continue Command.'
      })
    });

    const result = await runLocalSystemTool({
      toolId: execShellToolId,
      inputs: {
        contextToken,
        command: 'sleep 30',
        waitSeconds: 20
      }
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.waitSeconds).toBe(20);
    expect(result.output?.running).toBe(true);
    expect(result.output?.terminalId).toBe('exec-123');
    expect(result.output?.nextOffset).toBe(42);
    expect(String(result.toolResponse)).toContain('still running');
    expect(result.toolResponseForUI).toMatchObject({
      kind: 'sandbox_exec',
      command: 'sleep 30',
      running: true
    });
  });

  it('exposes enriched exec details for UI cards', async () => {
    const { execShellToolId } = getLocalSystemToolIds();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'session-6',
        running: false,
        completed: true,
        exit_code: 0,
        timed_out: false,
        duration_ms: 18,
        stdout: 'hello\n',
        stderr: '',
        terminal_output_text: '$ echo hello\nhello\n',
        terminal_output_truncated: false,
        command: 'echo hello',
        stdin: 'seed',
        workdir: '/workspace'
      })
    });

    const result = await runLocalSystemTool({
      toolId: execShellToolId,
      inputs: {
        contextToken,
        command: 'echo hello',
        stdin: 'seed'
      }
    });

    expect(result.output).toMatchObject({
      terminalOutputText: '$ echo hello\nhello\n',
      terminalOutputTruncated: false,
      command: 'echo hello',
      stdin: 'seed'
    });
    expect(result.toolResponseForUI).toMatchObject({
      kind: 'sandbox_exec',
      command: 'echo hello',
      stdin: 'seed',
      terminalOutputText: '$ echo hello\nhello\n',
      stdout: 'hello\n'
    });
  });

  it('continues long-running commands with terminalId and offset', async () => {
    const { continueCommandToolId } = getLocalSystemToolIds();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'session-4',
        running: false,
        completed: true,
        terminal_id: 'exec-456',
        offset: 42,
        next_offset: 84,
        output_text: 'done\n',
        output_truncated: false,
        preview_truncated: false,
        exit_code: 0,
        timed_out: false,
        workdir: '/workspace'
      })
    });

    const result = await runLocalSystemTool({
      toolId: continueCommandToolId,
      inputs: {
        contextToken,
        terminalId: 'exec-456',
        offset: 42
      }
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3081/v1/exec/continue');
    expect(body.terminalId).toBe('exec-456');
    expect(body.offset).toBe(42);
    expect(result.output?.completed).toBe(true);
    expect(result.output?.exitCode).toBe(0);
  });

  it('stops long-running commands with terminalId and offset', async () => {
    const { stopCommandToolId } = getLocalSystemToolIds();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'session-5',
        stopped: true,
        running: false,
        completed: true,
        terminal_id: 'exec-789',
        signal: 'terminate',
        offset: 84,
        next_offset: 120,
        output_text: 'terminated\n',
        output_truncated: false,
        preview_truncated: false,
        exit_code: 143,
        workdir: '/workspace'
      })
    });

    const result = await runLocalSystemTool({
      toolId: stopCommandToolId,
      inputs: {
        contextToken,
        terminalId: 'exec-789',
        offset: 84
      }
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3081/v1/exec/stop');
    expect(body.terminalId).toBe('exec-789');
    expect(body.offset).toBe(84);
    expect(result.output?.stopped).toBe(true);
    expect(result.output?.signal).toBe('terminate');
  });

  it('keeps legacy exec nodes working without exposing the legacy tool in new tool lists', async () => {
    const { legacyExecToolId } = getLocalSystemToolIds();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'session-legacy',
        running: false,
        completed: true,
        exit_code: 0,
        timed_out: false,
        duration_ms: 15,
        stdout: 'legacy-ok\n',
        stderr: '',
        workdir: '/workspace'
      })
    });

    const tools = getLocalSystemTools();
    expect(tools.some((tool) => tool.id === legacyExecToolId)).toBe(false);

    await runLocalSystemTool({
      toolId: legacyExecToolId,
      inputs: {
        contextToken,
        command: 'echo legacy-ok'
      }
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.command).toBe('echo legacy-ok');
    expect(body.argv).toBeUndefined();
  });
});
