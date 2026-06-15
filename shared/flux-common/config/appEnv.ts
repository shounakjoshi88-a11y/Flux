/**
 * @license
 * Copyright 2025 Flux (flux.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPlatformServices } from '../platform';

/**
 * Returns baseName unchanged in release builds, or baseName + '-dev' in dev builds.
 * When AIONUI_MULTI_INSTANCE=1, appends '-2' to isolate the second dev instance.
 * Used to isolate symlink and directory names between environments.
 *
 * @example
 * getEnvAwareName('.flux')        // release → '.flux',        dev → '.flux-dev'
 * getEnvAwareName('.flux-config') // release → '.flux-config', dev → '.flux-config-dev'
 * // with AIONUI_MULTI_INSTANCE=1:  dev → '.flux-dev-2'
 */
export function getEnvAwareName(baseName: string): string {
  if (getPlatformServices().paths.isPackaged() === true) return baseName;
  const suffix = process.env.AIONUI_MULTI_INSTANCE === '1' ? '-dev-2' : '-dev';
  return `${baseName}${suffix}`;
}
