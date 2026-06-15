/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FileChangeItem } from '../../../components/aion/base/FileChangesPanel';
import { usePreviewLauncher } from '../file/usePreviewLauncher';
import { extractContentFromDiff } from '../../../utils/aion/file/diffUtils';
import { getFileTypeInfo } from '../../../utils/aion/file/fileType';
import { useCallback } from 'react';

interface DiffPreviewHandlersOptions {
  /** Diff text content */
  diffText: string;
  /** Display file name (base name) */
  display_name: string;
  /** Full/relative file path (used for workspace resolution) */
  file_path?: string;
  /** Optional preview panel title */
  title?: string;
}

/**
 * Shared hook for file preview and diff preview click handlers
 *
 * Used by components that display FileChangesPanel and need
 * handleFileClick (open file preview) and handleDiffClick (open diff view)
 */
export const useDiffPreviewHandlers = ({ diffText, display_name, file_path, title }: DiffPreviewHandlersOptions) => {
  const { launchPreview } = usePreviewLauncher();

  const handleFileClick = useCallback(
    (_file: FileChangeItem) => {
      const { contentType, editable, language } = getFileTypeInfo(display_name);
      void launchPreview({
        relativePath: file_path || display_name,
        file_name: display_name,
        title,
        contentType,
        editable,
        language,
        fallbackContent: editable ? extractContentFromDiff(diffText) : undefined,
        diffContent: diffText,
      });
    },
    [diffText, display_name, file_path, title, launchPreview]
  );

  const handleDiffClick = useCallback(
    (_file: FileChangeItem) => {
      void launchPreview({
        file_name: display_name,
        title,
        contentType: 'diff',
        editable: false,
        language: 'diff',
        diffContent: diffText,
      });
    },
    [diffText, display_name, title, launchPreview]
  );

  return { handleFileClick, handleDiffClick };
};
