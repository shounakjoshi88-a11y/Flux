/**
 * @license
 * Copyright 2025 Flux (flux.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '../config/storage';

type SideQuestionConversationType = TChatConversation['type'];

export type SideQuestionEligibilityTarget = {
  backend?: string;
  type: SideQuestionConversationType;
};

export function isSideQuestionSupported(target: SideQuestionEligibilityTarget): boolean {
  return target.type === 'acp' && target.backend === 'claude';
}
