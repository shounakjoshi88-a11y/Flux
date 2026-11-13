/**
 * The model catalog the frontend shows, grouped by category.
 *
 * Kept beside NIM_MODELS because it is the human-facing view of the same
 * catalog: add a model here once, and it is routable and listed.
 */
import { AVAILABLE_MODELS as models } from '../../agents/model-router';

export type ModelCategory = { category: string; models: { id: string; label: string }[] };

export const availableModels: ModelCategory[] = models;
