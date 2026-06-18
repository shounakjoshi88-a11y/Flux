declare module "abcjs";
declare module "abcjs/dist/abcjs-basic";

// CSS Module declarations
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*.css" {
  const content: string;
  export default content;
}

// Electron API on window
interface Window {
  electronAPI?: {
    platform?: string;
    versions?: Record<string, string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
}

// Missing package declarations
declare module "@dnd-kit/core" {
  export const DndContext: any;
  export const DragOverlay: any;
  export const useDraggable: any;
  export const useDroppable: any;
  export const closestCenter: any;
  export const KeyboardSensor: any;
  export const PointerSensor: any;
  export const useSensor: any;
  export const useSensors: any;
  export type DragEndEvent = any;
  export type DragStartEvent = any;
}

declare module "@dnd-kit/sortable" {
  export const SortableContext: any;
  export const useSortable: any;
  export const arrayMove: any;
  export const verticalListSortingStrategy: any;
  export const sortableKeyboardCoordinates: any;
}

declare module "@dnd-kit/utilities" {
  export const CSS: any;
}

declare module "qrcode.react" {
  import React from "react";
  const QRCode: React.FC<{ value: string; size?: number; level?: string }>;
  export default QRCode;
}

declare module "@sentry/electron/renderer" {
  export const init: any;
}

declare module "electron" {
  export const app: any;
  export const BrowserWindow: any;
  export const ipcMain: any;
  export const ipcRenderer: any;
  export const shell: any;
  export const dialog: any;
}

declare module "@office-ai/platform" {
  export const bridge: {
    buildProvider<Data, Params = undefined>(
      channel: string
    ): {
      provider: (handler: (params: Params) => Promise<Data>) => void;
      invoke: Params extends undefined ? () => Promise<Data> : (params: Params) => Promise<Data>;
    };
    buildEmitter<Params = undefined>(
      channel: string
    ): {
      on: (callback: (params: Params) => void) => () => void;
      emit: (params: Params) => void;
    };
    on: (event: string, handler: (...args: any[]) => void) => void;
    off: (event: string, handler: (...args: any[]) => void) => void;
  };
  export const theme: {
    Color: { PrimaryColor: string };
    [key: string]: any;
  };
}

declare module "katex/dist/contrib/mhchem.min.js";

// Image asset declarations
declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}