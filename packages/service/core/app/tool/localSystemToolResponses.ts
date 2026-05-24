import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';

const getIntEnv = (key: string, def: number) => {
  const value = process.env[key];
  if (!value) return def;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : def;
};

const TOOL_RESPONSE_MAX_CHARS = getIntEnv('HIVECHAT_SANDBOX_TOOL_RESPONSE_MAX_CHARS', 4000);
const FILE_LIST_MAX_ENTRIES = getIntEnv('HIVECHAT_SANDBOX_FILE_LIST_MAX_ENTRIES', 12);
const READ_FILE_CONTENT_MAX_CHARS = getIntEnv('HIVECHAT_SANDBOX_READ_FILE_CONTENT_MAX_CHARS', 3200);
const EXEC_OUTPUT_MAX_CHARS = getIntEnv('HIVECHAT_SANDBOX_EXEC_OUTPUT_MAX_CHARS', 3200);
const EXEC_ACTION_HINT_MAX_CHARS = getIntEnv('HIVECHAT_SANDBOX_EXEC_ACTION_HINT_MAX_CHARS', 240);

const normalizeText = (value: unknown) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .trim();

const truncateToolResponse = (text: string) => {
  const normalized = normalizeText(text);
  if (!normalized) return '';

  const headChars = Math.max(200, Math.floor(TOOL_RESPONSE_MAX_CHARS * 0.75));
  const tailChars = Math.max(100, TOOL_RESPONSE_MAX_CHARS - headChars);

  return sliceStrStartEnd(normalized, headChars, tailChars);
};

const formatByteCount = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 'unknown size';

  if (parsed < 1024) return `${parsed} B`;
  if (parsed < 1024 * 1024) return `${(parsed / 1024).toFixed(parsed < 10 * 1024 ? 1 : 0)} KB`;

  return `${(parsed / (1024 * 1024)).toFixed(parsed < 10 * 1024 * 1024 ? 1 : 0)} MB`;
};

const truncateInline = (text: string, maxChars: number) => {
  const normalized = normalizeText(text);
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
};

const truncateContent = (text: string, maxChars: number) => {
  const normalized = normalizeText(text);
  if (!normalized) return '';

  const headChars = Math.max(120, Math.floor(maxChars * 0.8));
  const tailChars = Math.max(80, maxChars - headChars);

  return sliceStrStartEnd(normalized, headChars, tailChars);
};

const formatEntryName = (entry: Record<string, any>) => {
  const isDir = Boolean(entry.is_dir ?? entry.isDir);
  const path = String(entry.path || entry.name || '').trim();
  return isDir ? `${path || '.'}/` : path || '.';
};

export const summarizeListFilesToolResponse = ({
  path,
  entries
}: {
  path?: string;
  entries?: Array<Record<string, any>>;
}) => {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const directory = String(path || '.').trim() || '.';

  if (safeEntries.length === 0) {
    return `${directory}: empty`;
  }

  const dirCount = safeEntries.filter((entry) => Boolean(entry.is_dir ?? entry.isDir)).length;
  const fileCount = safeEntries.length - dirCount;
  const visibleEntries = safeEntries.slice(0, FILE_LIST_MAX_ENTRIES).map(formatEntryName);
  const hiddenCount = Math.max(0, safeEntries.length - visibleEntries.length);

  return truncateToolResponse(
    [
      `${directory}: ${fileCount} file${fileCount === 1 ? '' : 's'}, ${dirCount} dir${dirCount === 1 ? '' : 's'}`,
      `top entries: ${visibleEntries.join(', ')}`,
      ...(hiddenCount > 0 ? [`+${hiddenCount} more`] : [])
    ].join('\n')
  );
};

export const summarizeReadFileToolResponse = ({
  path,
  sizeBytes,
  truncated,
  contentText
}: {
  path: string;
  sizeBytes?: number;
  truncated?: boolean;
  contentText?: string;
}) => {
  const text = normalizeText(contentText);
  if (!text) {
    return `Read ${path} (${formatByteCount(sizeBytes)}, binary)`;
  }

  const header = `Read ${path} (${formatByteCount(sizeBytes)}${truncated ? ', truncated' : ''})`;

  return truncateToolResponse(`${header}\n${truncateContent(text, READ_FILE_CONTENT_MAX_CHARS)}`);
};

export const summarizeWriteFileToolResponse = ({
  path,
  uploaded,
  workspaceBytes,
  degraded
}: {
  path: string;
  uploaded?: Array<Record<string, any>>;
  workspaceBytes?: number;
  degraded?: boolean;
}) => {
  const uploadedCount = Array.isArray(uploaded) ? uploaded.length : 0;

  return [
    `Wrote ${path}`,
    ...(uploadedCount > 1 ? [`updated ${uploadedCount} files total`] : []),
    ...(Number.isFinite(Number(workspaceBytes))
      ? [`workspace ${formatByteCount(workspaceBytes)}`]
      : []),
    ...(degraded ? ['sandbox degraded'] : [])
  ].join(' ');
};

export const summarizeImportImageUrlToolResponse = ({
  path,
  sandboxUri,
  contentType,
  sizeBytes,
  renamed,
  workspaceBytes,
  degraded
}: {
  path: string;
  sandboxUri?: string;
  contentType?: string;
  sizeBytes?: number;
  renamed?: boolean;
  workspaceBytes?: number;
  degraded?: boolean;
}) =>
  [
    `Imported image to ${path}`,
    ...(sandboxUri ? [`sandboxUri: ${sandboxUri}`] : []),
    ...(contentType ? [contentType] : []),
    ...(Number.isFinite(Number(sizeBytes)) ? [formatByteCount(sizeBytes)] : []),
    ...(renamed ? ['renamed'] : []),
    ...(Number.isFinite(Number(workspaceBytes))
      ? [`workspace ${formatByteCount(workspaceBytes)}`]
      : []),
    ...(degraded ? ['sandbox degraded'] : [])
  ].join(' ');

export const summarizeExecToolResponse = ({
  running,
  completed,
  command,
  argv,
  exitCode,
  timedOut,
  actionHint,
  terminalId,
  nextOffset,
  outputText,
  stdout,
  stderr
}: {
  running?: boolean;
  completed?: boolean;
  command?: string;
  argv?: string[];
  exitCode?: number;
  timedOut?: boolean;
  actionHint?: string;
  terminalId?: string;
  nextOffset?: number;
  outputText?: string;
  stdout?: string;
  stderr?: string;
}) => {
  const normalizedStdout = normalizeText(outputText ?? stdout);
  const normalizedStderr = normalizeText(stderr);
  const commandText = command || (Array.isArray(argv) ? argv.join(' ') : '');
  const safeExitCode = Number.isFinite(Number(exitCode)) ? Number(exitCode) : 0;
  const truncatedStdout = truncateContent(normalizedStdout, EXEC_OUTPUT_MAX_CHARS);
  const truncatedStderr = truncateContent(normalizedStderr, EXEC_OUTPUT_MAX_CHARS);
  const normalizedHint = truncateInline(normalizeText(actionHint), EXEC_ACTION_HINT_MAX_CHARS);

  if (running && !completed) {
    const sections = ['still running'];
    if (terminalId) {
      sections.push(`terminalId: ${terminalId}`);
    }
    if (Number.isFinite(Number(nextOffset))) {
      sections.push(`nextOffset: ${Number(nextOffset)}`);
    }
    if (truncatedStdout) {
      sections.push(truncatedStdout);
    }
    if (normalizedHint) {
      sections.push(normalizedHint);
    }
    return truncateToolResponse(sections.join('\n\n'));
  }

  if (!timedOut && safeExitCode === 0 && normalizedStdout && !normalizedStderr) {
    return truncateToolResponse(truncatedStdout);
  }

  if (!timedOut && safeExitCode === 0 && !normalizedStdout && !normalizedStderr) {
    return commandText
      ? `Ran ${truncateInline(commandText, 160)}`
      : 'Command completed with no output';
  }

  const sections = [];

  if (timedOut) {
    sections.push('timed out');
  }

  if (safeExitCode !== 0) {
    sections.push(`exit ${safeExitCode}`);
  }

  if (!sections.length && commandText) {
    sections.push(`Ran ${truncateInline(commandText, 160)}`);
  }

  if (truncatedStderr) {
    sections.push(truncatedStderr);
  } else if (truncatedStdout) {
    sections.push(truncatedStdout);
  }

  return truncateToolResponse(sections.join('\n\n'));
};
