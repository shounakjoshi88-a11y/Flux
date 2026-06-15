/**
 * @license
 * Copyright 2025 Flux (flux.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../../../../shared/flux-common';

export const removeWorkspaceEntry = (path: string) => {
  return ipcBridge.fs.removeEntry.invoke({ path });
};

export const renameWorkspaceEntry = (path: string, new_name: string) => {
  return ipcBridge.fs.renameEntry.invoke({ path, new_name });
};
