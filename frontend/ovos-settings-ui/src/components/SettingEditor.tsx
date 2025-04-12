import React, { useState, useEffect } from 'react';
import { Check, X, Pencil, Trash2, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingEditorProps {
  value: any;
  path: (string | number)[];
  parentType?: 'array' | 'object';
  onSave: (path: (string | number)[], value: any) => Promise<void>;
  onDelete: (path: (string | number)[]) => Promise<void>;
}

export const SettingEditor: React.FC<SettingEditorProps> = ({
  value: initialValue,
  path,
  parentType,
  onSave,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [originalValue] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  
  // State for the inline 'add entry' form
  const [newEntryKey, setNewEntryKey] = useState('');
  const [newEntryValue, setNewEntryValue] = useState('');
  const [newEntryType, setNewEntryType] = useState<'string' | 'number' | 'boolean' | 'object' | 'array'>('string');
  const [isSavingNewEntry, setIsSavingNewEntry] = useState(false);

  const currentKeyOrIndex = path[path.length - 1];
  
  const getInputType = (val: any) => {
    if (typeof val === 'boolean') return 'boolean';
    if (typeof val === 'number') return 'number';
    if (Array.isArray(val)) return 'array';
    if (typeof val === 'object' && val !== null) return 'object';
    if (typeof val === 'string' && val.includes('\n')) return 'textarea';
    return 'text';
  };

  const type = getInputType(initialValue);

  // Reset add form when adding state changes or initial value changes
  useEffect(() => {
    if (!isAddingEntry) {
        setNewEntryKey('');
        setNewEntryValue('');
        setNewEntryType('string');
        setIsSavingNewEntry(false);
    }
  }, [isAddingEntry]);

  // Effect to set default value when type changes in the *add* form
  useEffect(() => {
    if (newEntryType === 'boolean') {
      if (newEntryValue !== 'true' && newEntryValue !== 'false') {
         setNewEntryValue('true'); 
      }
    } else if (newEntryType === 'object' || newEntryType === 'array') {
      setNewEntryValue('');
    }
  }, [newEntryType]);

  useEffect(() => {
    setValue(initialValue);
    setError(null);
  }, [initialValue, isEditing]);

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let processedValue: any;
      if (type === 'number') {
        processedValue = Number(value);
        if (isNaN(processedValue)) {
          throw new Error("Invalid number input");
        }
      } else if (type === 'boolean') {
        processedValue = value === true;
      } else {
        processedValue = value;
      }

      await onSave(path, processedValue);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save:', err);
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setValue(originalValue);
    setIsEditing(false);
    setError(null);
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${parentType === 'array' ? `item [${currentKeyOrIndex}]` : currentKeyOrIndex}?`)) {
      setIsLoading(true);
      try {
        await onDelete(path);
      } catch (error) {
        console.error('Failed to delete:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleCancelNewEntry = () => {
      setIsAddingEntry(false);
      // State clearing is handled by useEffect watching isAddingEntry
  };
  
  const handleSaveNewEntry = async () => {
      const newKey = newEntryKey.trim();
      // For arrays, the 'key' is the next index
      const newPathSegment = type === 'object' ? newKey : (initialValue as any[]).length;
      
      if (type === 'object' && !newKey) {
          alert("New field key cannot be empty.");
          return;
      }
      // TODO: Check if key already exists in object?
      
      setIsSavingNewEntry(true);
      try {
          let processedValue: any;
          switch (newEntryType) {
             case 'number':
                processedValue = Number(newEntryValue);
                if (isNaN(processedValue)) throw new Error("Invalid number");
                break;
             case 'boolean':
                processedValue = newEntryValue === 'true';
                break;
             case 'object': processedValue = {}; break;
             case 'array': processedValue = []; break;
             default: processedValue = newEntryValue;
          }
          
          const newPath = [...path, newPathSegment];
          
          // Call the main save handler passed down from SkillConfigurator
          await onSave(newPath, processedValue);
          
          // Close the add form on success
          setIsAddingEntry(false);
          
      } catch (error) {
          console.error("Failed to add new entry:", error);
          alert(`Failed to add entry: ${error instanceof Error ? error.message : "Unknown error"}`);
      } finally {
          setIsSavingNewEntry(false);
      }
  };

  const renderInlineAddForm = () => {
      return (
          <div className="p-2 space-y-2 border rounded-md bg-muted/50">
              {type === 'object' && (
                  <input
                    type="text"
                    placeholder="New field name"
                    value={newEntryKey}
                    onChange={(e) => setNewEntryKey(e.target.value)}
                    className="w-full rounded border bg-background p-1 text-xs"
                    autoFocus
                  />
              )}
              <select
                 value={newEntryType}
                 onChange={(e) => setNewEntryType(e.target.value as any)}
                 className="w-full rounded border bg-background p-1 text-xs"
               >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="object">Object (empty)</option>
                  <option value="array">Array (empty)</option>
              </select>
              
              {/* Conditional Value Input */} 
              {newEntryType === 'boolean' ? (
                 <select
                    value={newEntryValue}
                    onChange={(e) => setNewEntryValue(e.target.value)}
                    className="w-full rounded border bg-background p-1 text-xs"
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
              ) : newEntryType === 'object' || newEntryType === 'array' ? (
                 <div className="text-xs text-muted-foreground italic p-1">
                    (Initial value will be empty {newEntryType === 'object' ? '{}' : '[]'})
                 </div>
              ) : (
                 <input
                    type={newEntryType === 'number' ? 'number' : 'text'}
                    placeholder="Value"
                    value={newEntryValue}
                    onChange={(e) => setNewEntryValue(e.target.value)}
                    className="w-full rounded border bg-background p-1 text-xs"
                  />
              )}
              
               <div className="flex justify-end gap-1">
                  <button 
                      onClick={handleSaveNewEntry}
                      disabled={isSavingNewEntry || (type==='object' && !newEntryKey.trim())}
                      className={cn(buttonClasses, "text-green-600 hover:text-green-700 px-2 py-0.5 text-xs")}
                      title="Save New Entry"
                   > <Check size={14} /> </button>
                   <button 
                      onClick={handleCancelNewEntry}
                      disabled={isSavingNewEntry}
                      className={cn(buttonClasses, "text-red-600 hover:text-red-700 px-2 py-0.5 text-xs")}
                       title="Cancel Add Entry"
                   > <X size={14} /> </button>
               </div>
          </div>
      );
  }

  const renderDisplayValue = () => {
    if (type === 'object') {
      return (
        <div className="space-y-1 ml-4 border-l border-border/50">
          {Object.entries(initialValue).map(([key, val]) => {
            const childPath = [...path, key];
            return (
              <SettingEditor 
                key={childPath.join('.')}
                path={childPath}
                value={val}
                parentType={'object'}
                onSave={onSave}
                onDelete={onDelete}
              />
            );
          })}
          {isAddingEntry && (
            <div className="pl-4 border-l border-dashed border-green-500 py-2">
              {renderInlineAddForm()}
            </div>
          )}
        </div>
      );
    }
    if (type === 'array') {
      return (
        <div className="space-y-1 ml-4 border-l border-border/50">
          {initialValue.map((val: any, index: number) => {
            const childPath = [...path, index];
            return (
              <SettingEditor 
                key={childPath.join('.')}
                path={childPath}
                value={val}
                parentType={'array'}
                onSave={onSave}
                onDelete={onDelete}
              />
            );
          })}
          {isAddingEntry && (
            <div className="pl-4 border-l border-dashed border-green-500 py-2">
              {renderInlineAddForm()}
            </div>
          )}
        </div>
      );
    }
    return <span className="text-sm text-muted-foreground">{String(initialValue)}</span>;
  };

  const renderEditControl = () => {
    if (type === 'object' || type === 'array') {
      return renderDisplayValue();
    }

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
            value={String(value)}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border bg-background p-1 text-sm"
            autoFocus
          />
        );
      case 'textarea':
        return (
          <textarea
            value={String(value)}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border bg-background p-1 text-sm min-h-[100px]"
            autoFocus
          />
        );
      default:
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border bg-background p-1 text-sm"
            autoFocus
          />
        );
    }
  };

  const buttonClasses = "p-1 rounded hover:bg-accent hover:text-accent-foreground transition-colors";

  return (
    <div className="setting-item space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "font-semibold text-sm",
            parentType === 'array' ? "text-blue-600 dark:text-blue-400" : "text-primary"
          )}>
            {parentType === 'array' ? `[${currentKeyOrIndex}]` : String(currentKeyOrIndex)}
          </div>
          {(type === 'object' || type === 'array') && !isAddingEntry && !isEditing && (
            <button
              onClick={() => setIsAddingEntry(true)}
              className={cn(buttonClasses, "text-green-600 hover:text-green-700")}
              title={type === 'object' ? "Add New Field" : "Add New Item"}
            >
              <PlusCircle className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={isLoading}
                className={buttonClasses}
                title="Save"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={handleCancel}
                disabled={isLoading}
                className={buttonClasses}
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              {type !== 'object' && type !== 'array' && (
                <button
                  onClick={() => setIsEditing(true)}
                  className={buttonClasses}
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={handleDelete}
                className={buttonClasses}
                title="Delete"
              >
                <Trash2 className="h-4 w-4 text-red-500 hover:text-red-600" />
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="text-red-500 text-xs mb-1 pl-2">Error: {error}</div>
      )}
      
      <div className="pl-2">
        {isEditing ? renderEditControl() : renderDisplayValue()}
      </div>
    </div>
  );
};

export default SettingEditor;