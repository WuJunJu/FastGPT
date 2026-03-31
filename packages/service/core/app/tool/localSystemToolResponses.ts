import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';

const getIntEnv = (key: string, def: number) => {
  const value = process.env[key];
  if (!value) return def;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : def;
};

const TOOL_RESPONSE_MAX_CHARS = getIntEnv('HIVECHAT_SANDBOX_TOOL_RESPONSE_MAX_CHARS', 4000);
const FILE_LIST_MAX_ENTRIES = getIntEnv('HIVECHAT_SANDBOX_FILE_LIST_MAX_ENTRIES', 80);

const normalizeText = (value: unknown) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .trimEnd();

const truncateToolResponse = (text: string) => {
  const normalized = normalizeText(text);
  if (!normalized) return '';

  const headChars = Math.max(200, Math.floor(TOOL_RESPONSE_MAX_CHARS * 0.75));
  const tailChars = Math.max(100, TOOL_RESPONSE_MAX_CHARS - headChars);

  return sliceStrStartEnd(normalized, headChars, tailChars);
};

const formatByteCount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? `${parsed} bytes` : 'unknown size';
};

const formatEntryLine = (entry: Record<string, any>) => {
  const isDir = Boolean(entry.is_dir ?? entry.isDir);
  const path = String(entry.path || entry.name || '').trim();
  const size = isDir ? '' : ` (${formatByteCount(entry.size_bytes ?? entry.sizeBytes)})`;
  return `${isDir ? '[dir]' : '[file]'} ${path || '.'}${size}`;
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
    return `Directory ${directory} is empty.`;
  }

  const visibleEntries = safeEntries.slice(0, FILE_LIST_MAX_ENTRIES).map(formatEntryLine);
  const hiddenCount = safeEntries.length - visibleEntries.length;

  return truncateToolResponse(
    [
      `Directory ${directory}:`,
      ...visibleEntries,
      ...(hiddenCount > 0 ? [`...and ${hiddenCount} more entries`] : [])
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
    return `File ${path} is binary or not valid UTF-8 (${formatByteCount(sizeBytes)}).`;
  }

  const header = truncated
    ? `File ${path} (${formatByteCount(sizeBytes)}, truncated):`
    : `File ${path}:`;

  return truncateToolResponse(`${header}\n${text}`);
};

export const summarizeWriteFileToolResponse = ({
  path,
  uploaded,
  degraded
}: {
  path: string;
  uploaded?: Array<Record<string, any>>;
  degraded?: boolean;
}) => {
  const uploadedCount = Array.isArray(uploaded) ? uploaded.length : 0;

  return [
    `Wrote ${path}.`,
    ...(uploadedCount > 1 ? [`Updated ${uploadedCount} files.`] : []),
    ...(degraded ? ['Sandbox session is currently degraded.'] : [])
  ].join(' ');
};

export const summarizeExecToolResponse = ({
  command,
  argv,
  exitCode,
  timedOut,
  stdout,
  stderr
}: {
  command?: string;
  argv?: string[];
  exitCode?: number;
  timedOut?: boolean;
  stdout?: string;
  stderr?: string;
}) => {
  const normalizedStdout = normalizeText(stdout);
  const normalizedStderr = normalizeText(stderr);
  const commandText = command || (Array.isArray(argv) ? argv.join(' ') : '');
  const safeExitCode = Number.isFinite(Number(exitCode)) ? Number(exitCode) : 0;

  if (!timedOut && safeExitCode === 0 && normalizedStdout && !normalizedStderr) {
    return truncateToolResponse(normalizedStdout);
  }

  const sections = [
    ...(commandText ? [`Command: ${commandText}`] : []),
    `Exit code: ${safeExitCode}`,
    ...(timedOut ? ['Timed out: yes'] : []),
    ...(normalizedStdout ? [`Stdout:\n${normalizedStdout}`] : []),
    ...(normalizedStderr ? [`Stderr:\n${normalizedStderr}`] : []),
    ...(!normalizedStdout && !normalizedStderr && safeExitCode === 0 && !timedOut
      ? ['Command completed successfully with no output.']
      : [])
  ];

  return truncateToolResponse(sections.join('\n\n'));
};
