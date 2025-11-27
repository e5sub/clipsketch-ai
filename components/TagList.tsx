import React, { useState, useRef } from 'react';
import { Tag } from '../types';
import { formatTime, exportVideoFrames, generateId } from '../utils';
import { Trash2, Play, Clock, Download, Image as ImageIcon, Loader2, Sparkles, Upload } from 'lucide-react';
import { Button } from './Button';

interface TagListProps {
  tags: Tag[];
  videoUrl: string | null;
  onRemoveTag: (id: string) => void;
  onJumpToTag: (timestamp: number) => void;
  onClearTags: () => void;
  onGenerateArt: () => void;
  onImportTags: (tags: Tag[]) => void;
}

export const TagList: React.FC<TagListProps> = ({ 
  tags, 
  videoUrl, 
  onRemoveTag, 
  onJumpToTag, 
  onClearTags, 
  onGenerateArt,
  onImportTags
}) => {
  const [isExportingImages, setIsExportingImages] = useState(false);
  const [exportProgress, setExportProgress] = useState<{current: number, total: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleExportTxt = () => {
    const textContent = tags
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(t => `[${formatTime(t.timestamp, true)}] ${t.label || '标记事件'}`)
      .join('\n');
    
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `video-tags-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n');
      const newTags: Tag[] = [];

      lines.forEach(line => {
        // Matches [MM:SS.mmm] or [HH:MM:SS.mmm] and optional label
        const match = line.trim().match(/^\[([\d:.]+)\]\s*(.*)$/);
        if (match) {
          const timeStr = match[1];
          const label = match[2];
          
          const parts = timeStr.split(':');
          let seconds = 0;

          if (parts.length === 3) {
            // HH:MM:SS.mmm
            seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
          } else if (parts.length === 2) {
            // MM:SS.mmm
            seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
          }

          if (!isNaN(seconds)) {
            newTags.push({
              id: generateId(),
              timestamp: seconds,
              label: label || '导入事件',
              createdAt: Date.now()
            });
          }
        }
      });

      if (newTags.length > 0) {
        onImportTags(newTags);
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        alert("文件中未找到有效标记。请确保格式为：[MM:SS.mmm] 标签内容");
      }
    } catch (error) {
      console.error("Import failed:", error);
      alert("读取文件失败。");
    }
  };

  const handleExportImages = async () => {
    if (!videoUrl || tags.length === 0) return;
    
    setIsExportingImages(true);
    setExportProgress({ current: 0, total: tags.length });

    try {
      const zipBlob = await exportVideoFrames(videoUrl, tags, (current, total) => {
        setExportProgress({ current, total });
      });

      if (zipBlob) {
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `video-frames-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert("导出图片失败。注意：跨域限制可能会阻止从外部链接捕获帧。");
    } finally {
      setIsExportingImages(false);
      setExportProgress(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 w-full">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".txt" 
        className="hidden" 
      />

      <div className="p-3 lg:p-4 border-b border-slate-800 bg-slate-900 shrink-0">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-base lg:text-lg font-semibold flex items-center gap-2 text-white">
            <Clock className="w-4 h-4 lg:w-5 lg:h-5 text-indigo-400" />
            标记列表 ({tags.length})
          </h2>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleImportClick}
              disabled={isExportingImages}
              title="导入 TXT 标记"
              className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <Upload className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClearTags}
              disabled={tags.length === 0 || isExportingImages}
              title="清空所有"
              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-950/30"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
           <Button 
            variant="secondary" 
            size="sm" 
            onClick={handleExportTxt}
            disabled={tags.length === 0 || isExportingImages}
            title="导出为 TXT"
            className="text-xs h-9"
          >
            <Download className="w-3.5 h-3.5 mr-2" />
            TXT
          </Button>
           <Button 
            variant="secondary" 
            size="sm" 
            onClick={handleExportImages}
            disabled={tags.length === 0 || !videoUrl || isExportingImages}
            title="导出帧为 ZIP"
            className="text-xs h-9"
          >
            {isExportingImages ? (
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5 mr-2" />
            )}
            图片 ZIP
          </Button>
        </div>

        <Button
          variant="primary"
          size="sm"
          className="w-full h-10 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 border-none shadow-md shadow-indigo-900/20"
          onClick={onGenerateArt}
          disabled={tags.length === 0 || !videoUrl || isExportingImages}
        >
          <Sparkles className="w-4 h-4 mr-2" />
          下一步：AI 绘图
        </Button>
        
        {isExportingImages && exportProgress && (
           <div className="mt-3 text-xs text-slate-400 text-center bg-slate-950/50 py-1 rounded">
             正在处理：{exportProgress.current} / {exportProgress.total} 帧...
           </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar min-h-0 bg-slate-950/30">
        {tags.length === 0 ? (
          <div className="text-center text-slate-500 mt-10 p-4">
            <p className="mb-2">暂无标记</p>
            <p className="text-xs lg:text-sm">播放时点击 "Tag" 按钮或按下“T”键标记精彩瞬间</p>
          </div>
        ) : (
          tags.sort((a, b) => a.timestamp - b.timestamp).map((tag) => (
            <div 
              key={tag.id} 
              className="group flex items-center justify-between p-2 lg:p-3 rounded-lg bg-slate-800 hover:bg-slate-750 border border-transparent hover:border-slate-600 transition-all cursor-pointer"
              onClick={() => !isExportingImages && onJumpToTag(tag.timestamp)}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                  <Play className="w-3 h-3 fill-current" />
                </div>
                <div>
                  <span className="text-base lg:text-lg font-mono font-medium text-slate-200 block leading-tight">
                    {formatTime(tag.timestamp, true)}
                  </span>
                  <p className="text-[10px] lg:text-xs text-slate-500 truncate max-w-[150px]">
                     {tag.label !== 'Imported Event' && tag.label !== 'Marked Event' && tag.label !== '导入事件' && tag.label !== '标记事件' ? tag.label : '标记事件'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-400"
                disabled={isExportingImages}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveTag(tag.id);
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};