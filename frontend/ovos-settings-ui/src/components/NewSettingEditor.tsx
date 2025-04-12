import React, { useState, useEffect } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewSettingEditorProps {
  onSave: (key: string, value: any) => Promise<void>;
}

export const NewSettingEditor: React.FC<NewSettingEditorProps> = ({ onSave }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState<'string' | 'number' | 'boolean' | 'object' | 'array'>('string');
  const [isLoading, setIsLoading] = useState(false);

  // Effect to set default value when type changes
  useEffect(() => {
    if (type === 'boolean') {
      if (value !== 'true' && value !== 'false') {
         setValue('true'); 
      }
    } else if (type === 'object' || type === 'array') {
      // Clear/disable value input for complex types
      setValue(''); // Clear any previous primitive value
    } 
  }, [type]); 

  const handleSave = async () => {
    if (!key.trim()) return;
    setIsLoading(true);
    
    try {
      // Initialize processedValue based on type
      let processedValue: any;
      switch (type) {
        case 'number':
          processedValue = Number(value);
          if (isNaN(processedValue)) {
              alert("Invalid number input."); // Simple validation feedback
              setIsLoading(false);
              return;
          }
          break;
        case 'boolean':
          processedValue = value === 'true';
          break;
        case 'object':
          processedValue = {}; // Save as empty object
          break;
        case 'array':
          processedValue = []; // Save as empty array
          break;
        default: // string
          processedValue = value;
          break;
      }
      
      console.log("NewSettingEditor sending:", { key: key.trim(), valueState: value, typeState: type, processedValue });
      await onSave(key.trim(), processedValue);
      setIsAdding(false);
      setKey('');
      setValue('');
      setType('string');
    } catch (error) {
      console.error('Failed to add setting:', error);
      alert("Failed to add setting. Check console."); // User feedback
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
          <option value="object">Object</option>
          <option value="array">Array</option>
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
        ) : type === 'object' || type === 'array' ? (
          <div className="text-xs text-muted-foreground italic p-1">
            (Initial value will be empty {type === 'object' ? '{}' : '[]'})
          </div>
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