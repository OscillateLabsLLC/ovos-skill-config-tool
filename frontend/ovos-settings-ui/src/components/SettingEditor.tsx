import React, { useState } from 'react';
import { Check, X, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingEditorProps {
  settingKey: string;
  value: any;
  onSave: (key: string, value: any) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
}

export const SettingEditor: React.FC<SettingEditorProps> = ({
  settingKey,
  value: initialValue,
  onSave,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [originalValue] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(false);

  const getInputType = (val: any) => {
    if (typeof val === 'boolean') return 'boolean';
    if (typeof val === 'number') return 'number';
    if (typeof val === 'string' && val.includes('\n')) return 'textarea';
    return 'text';
  };

  const type = getInputType(initialValue);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      let processedValue = value;
      if (type === 'number') {
        processedValue = Number(value);
      }
      await onSave(settingKey, processedValue);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save:', error);
      setValue(originalValue); // Reset on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setValue(originalValue);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${settingKey}?`)) {
      setIsLoading(true);
      try {
        await onDelete(settingKey);
      } catch (error) {
        console.error('Failed to delete:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const renderEditControl = () => {
    switch (type) {
      case 'boolean':
        return (
          <select
            value={String(value)}
            onChange={(e) => setValue(e.target.value === 'true')}
            className="w-24 rounded border bg-background p-1 text-sm"
            autoFocus
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        );
      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border bg-background p-1 text-sm"
            autoFocus
          />
        );
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border bg-background p-1 text-sm min-h-[100px]"
            autoFocus
          />
        );
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border bg-background p-1 text-sm"
            autoFocus
          />
        );
    }
  };

  const buttonClasses = "p-1 rounded hover:bg-accent hover:text-accent-foreground transition-colors";

  return (
    <div className="space-y-1">
      <div className="font-medium text-sm text-primary mb-1">
        {settingKey}
      </div>
      <div className="flex items-start gap-2">
        {isEditing ? (
          <>
            <div className="flex-grow">
              {renderEditControl()}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleSave}
                disabled={isLoading}
                className={buttonClasses}
                title="Save"
              >
                <Check className="h-6 w-6" />
              </button>
              <button
                onClick={handleCancel}
                disabled={isLoading}
                className={buttonClasses}
                title="Cancel"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={cn(
              "flex-grow text-sm text-muted-foreground font-mono break-words",
              typeof value === 'string' && value.length > 50 && "text-xs"
            )}>
              {String(value)}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsEditing(true)}
                className={buttonClasses}
                title="Edit"
              >
                <Pencil className="h-6 w-6" />
              </button>
              <button
                onClick={handleDelete}
                className={buttonClasses}
                title="Delete"
              >
                <Trash2 className="h-6 w-6 text-red-500 hover:text-red-600" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SettingEditor;