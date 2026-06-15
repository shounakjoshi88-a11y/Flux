/**
 * @license
 * Copyright 2025 Flux (flux.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Steps } from '@arco-design/web-react';
import type { StepsProps } from '@arco-design/web-react/es/Steps';
import classNames from 'classnames';
import React from 'react';

/**
 * 步骤条组件属性 / Steps component props
 */
export interface FluxStepsProps extends StepsProps {
  /** 额外的类名 / Additional class name */
  className?: string;
}

/**
 * 步骤条组件 / Steps component
 *
 * 基于 Arco Design Steps 的封装，提供统一的样式主题
 * Wrapper around Arco Design Steps with unified theme styling
 *
 * @features
 * - 自定义品牌色主题 / Custom brand color theme
 * - 完成态的特殊样式处理 / Special styling for finished state
 * - 完整的 Arco Steps API 支持 / Full Arco Steps API support
 *
 * @example
 * ```tsx
 * // 基本用法 / Basic usage
 * <FluxSteps current={1}>
 *   <FluxSteps.Step title="步骤1" description="这是描述" />
 *   <FluxSteps.Step title="步骤2" description="这是描述" />
 *   <FluxSteps.Step title="步骤3" description="这是描述" />
 * </FluxSteps>
 *
 * // 垂直步骤条 / Vertical steps
 * <FluxSteps current={1} direction="vertical">
 *   <FluxSteps.Step title="步骤1" description="描述" />
 *   <FluxSteps.Step title="步骤2" description="描述" />
 * </FluxSteps>
 *
 * // 带图标的步骤条 / Steps with icons
 * <FluxSteps current={1}>
 *   <FluxSteps.Step title="完成" icon={<IconCheck />} />
 *   <FluxSteps.Step title="进行中" icon={<IconLoading />} />
 *   <FluxSteps.Step title="待处理" icon={<IconClock />} />
 * </FluxSteps>
 *
 * // 迷你版步骤条 / Mini steps
 * <FluxSteps current={1} size="small" type="dot">
 *   <FluxSteps.Step title="步骤1" />
 *   <FluxSteps.Step title="步骤2" />
 *   <FluxSteps.Step title="步骤3" />
 * </FluxSteps>
 * ```
 *
 * @see arco-override.css for custom styles (.flux-steps)
 */
const FluxSteps: React.FC<FluxStepsProps> & { Step: typeof Steps.Step } = ({ className, ...props }) => {
  return <Steps {...props} className={classNames('flux-steps', className)} />;
};

FluxSteps.displayName = 'FluxSteps';

// 导出子组件 / Export sub-component
FluxSteps.Step = Steps.Step;

export default FluxSteps;
