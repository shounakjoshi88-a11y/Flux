import React, { useState } from 'react';
import { ChevronDown, Eye } from 'lucide-react';

export interface FileChangeItem {
  file_name: string;
  fullPath: string;
  insertions: number;
  deletions: number;
}

export interface FileChangesPanelProps {
  title: string;
  files: FileChangeItem[];
  defaultExpanded?: boolean;
  onFileClick?: (file: FileChangeItem) => void;
  onDiffClick?: (file: FileChangeItem) => void;
  className?: string;
}

export const diffColors = {
  addition: '#52c41a',
  deletion: '#ff4d4f',
};

const FileChangesPanel: React.FC<FileChangesPanelProps> = ({
  title,
  files,
  defaultExpanded = true,
  onFileClick,
  onDiffClick,
  className,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (files.length === 0) {
    return null;
  }

  return (
    <div
      className={`w-full rounded-lg overflow-hidden border border-zinc-700/30 bg-zinc-800/20 ${className || ''}`}
    >
      {/* Header */}
      <div
        className='flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-zinc-700/10 transition-colors'
        onClick={() => setExpanded(!expanded)}
      >
        <div className='flex items-center gap-2'>
          <span className='w-2 h-2 rounded-full shrink-0' style={{ backgroundColor: diffColors.addition }}></span>
          <span className='text-sm text-zinc-200 font-medium'>{title}</span>
        </div>
        <ChevronDown
          className={`size-4 text-zinc-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* File list */}
      {expanded && (
        <div className='w-full border-t border-zinc-700/30'>
          {files.map((file, index) => (
            <div
              key={`${file.fullPath}-${index}`}
              className='group flex items-center justify-between px-4 py-3 hover:bg-zinc-700/20 transition-colors'
            >
              <div className='flex items-center min-w-0'>
                <span className='text-sm text-zinc-300 truncate'>{file.file_name}</span>
              </div>
              <div className='flex items-center gap-3 shrink-0'>
                {/* Change stats */}
                {(file.insertions > 0 || file.deletions > 0) && (
                  <span
                    className={`flex items-center gap-1 px-1 py-0.5 rounded transition-colors ${onDiffClick ? 'cursor-pointer hover:bg-zinc-700/30' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDiffClick?.(file);
                    }}
                  >
                    {file.insertions > 0 && (
                      <span className='text-xs font-medium' style={{ color: diffColors.addition }}>
                        +{file.insertions}
                      </span>
                    )}
                    {file.deletions > 0 && (
                      <span className='text-xs font-medium' style={{ color: diffColors.deletion }}>
                        -{file.deletions}
                      </span>
                    )}
                  </span>
                )}
                {/* Preview button */}
                <button
                  className='opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/30 px-2 py-1 rounded'
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileClick?.(file);
                  }}
                >
                  <Eye className='size-3.5' />
                  Preview
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileChangesPanel;
