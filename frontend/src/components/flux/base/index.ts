/**
 * @license
 * Copyright 2025 Flux (flux.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Flux 基础组件库统一导出 / Flux base components unified exports
 *
 * 提供所有基础组件和类型的统一导出入口
 * Provides unified export entry for all base components and types
 */

// ==================== 组件导出 / Component Exports ====================

export { default as FluxModal } from './FluxModal';
export { default as FluxCollapse } from './FluxCollapse';
export { default as FluxSelect } from './FluxSelect';
export { default as FluxScrollArea } from './FluxScrollArea';
export { default as FluxSteps } from './FluxSteps';

// ==================== 类型导出 / Type Exports ====================

// FluxModal 类型 / FluxModal types
export type {
  ModalSize,
  ModalHeaderConfig,
  ModalFooterConfig,
  ModalContentStyleConfig,
  FluxModalProps,
} from './FluxModal';
export { MODAL_SIZES } from './FluxModal';

// FluxCollapse 类型 / FluxCollapse types
export type { FluxCollapseProps, FluxCollapseItemProps } from './FluxCollapse';

// FluxSelect 类型 / FluxSelect types
export type { FluxSelectProps } from './FluxSelect';

// FluxSteps 类型 / FluxSteps types
export type { FluxStepsProps } from './FluxSteps';
