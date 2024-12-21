import React from 'react';
import { Moon, Sun, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  isDark: boolean;
  onThemeToggle: () => void;
  skills: any[]; // We'll properly type this later
}

export const Header: React.FC<HeaderProps> = ({ isDark, onThemeToggle, skills }) => {
  const handleExport = () => {
    // Create a JSON file with formatted (pretty-printed) content
    const content = JSON.stringify(skills, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = 'skill-settings.json';
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-b">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-primary">Skill Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure your voice assistant skills
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleExport}
              className="h-9 w-9"
              title="Export settings"
            >
              <Download className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              onClick={onThemeToggle}
              className="h-9 w-9"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;