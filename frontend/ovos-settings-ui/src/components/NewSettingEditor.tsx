import React, { useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewSettingEditorProps {
  onSave: (key: string, value: any) => Promise<void>;
}

export const NewSettingEditor: React.FC<NewSettingEditorProps> = ({ onSave }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState<'string' | 'number' | 'boolean'>('string');
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!key.trim()) return;
    setIsLoading(true);
    
    try {
      let processedValue = value;
      switch (type) {
        case 'number':
          processedValue = Number(value);
          break;
        case 'boolean':
          processedValue = value === 'true';
          break;
      }
      
      await onSave(key.trim(), processedValue);
      setIsAdding(false);
      setKey('');
      setValue('');
      setType('string');
    } catch (error) {
      console.error('Failed to add setting:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setKey('');
    setValue('');
    setType('string');
  };

  if (!isAdding) {
    return (
      <button
        onClick={() => setIsAdding(true)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="h-6 w-6" />
        Add Setting
      </button>
    );
  }

  const buttonClasses = "p-1 rounded hover:bg-accent hover:text-accent-foreground transition-colors";

  return (
    <div className="border rounded-md p-4 space-y-4">
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Setting name"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="w-full rounded border bg-background p-1 text-sm"
          autoFocus
        />
        
        <select
          value={type}
          onChange={(e) => setType(e.target.value as any)}
          className="w-full rounded border bg-background p-1 text-sm"
        >
          <option value="string">String</option>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
        </select>

        {type === 'boolean' ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border bg-background p-1 text-sm"
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        ) : (
          <input
            type={type === 'number' ? 'number' : 'text'}
            placeholder="Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border bg-background p-1 text-sm"
          />
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={handleSave}
          disabled={isLoading || !key.trim()}
          className={cn(buttonClasses, "text-green-600 hover:text-green-700")}
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
          <X className="h-6 w-6 text-red-600 hover:text-red-700" />
        </button>
      </div>
    </div>
  );
};

export default NewSettingEditor;