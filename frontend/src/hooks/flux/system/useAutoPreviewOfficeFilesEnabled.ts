import type { IResponseMessage } from '../../../../../shared/flux-common/adapter/ipcBridge';
import { useConfig } from '../config/useConfig';

const OFFICE_AUTO_PREVIEW_TRIGGER_TYPES = new Set(['tool_group', 'tool_call', 'acp_tool_call']);

export const isOfficeAutoPreviewTriggerMessage = (message: Pick<IResponseMessage, 'type'>): boolean =>
  OFFICE_AUTO_PREVIEW_TRIGGER_TYPES.has(message.type);

export const findNewOfficeFiles = (currentFiles: string[], knownFiles: Set<string>): string[] =>
  currentFiles.filter((file_path) => !knownFiles.has(file_path));

/**
 * Returns whether auto-preview for newly created Office files is enabled globally.
 */
export const useAutoPreviewOfficeFilesEnabled = (): boolean => {
  const [enabled] = useConfig('system.autoPreviewOfficeFiles');
  return enabled ?? true;
};
