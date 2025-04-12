import React from 'react';
import { Moon, Sun, Download, LogOut } from 'lucide-react';
import { cn } from "@/lib/utils";
import { SkillSetting } from "./SkillConfigurator";
import { useAuth } from '@/lib/auth';

interface LogoConfig {
  type: 'image' | 'text';
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  text?: string;
}

interface HeaderProps {
  isDark: boolean;
  onThemeToggle: () => void;
  skills: SkillSetting[];
  logo: LogoConfig;
}

export const Header: React.FC<HeaderProps> = ({ isDark, onThemeToggle, skills, logo }) => {
  const { logout, username } = useAuth();

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
    <header className="border-b">
      <div className="flex h-16 items-center px-4 md:px-6">
        <div className="flex items-center gap-2">
          {logo.type === 'image' ? (
            <img
              src={logo.src}
              alt={logo.alt || 'Logo'}
              width={logo.width || 32}
              height={logo.height || 32}
              className="h-8 w-auto"
            />
          ) : (
            <span className="text-xl font-bold">{logo.text}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">User: {username}</span>
          <button
            onClick={handleExport}
            className={cn(
              "rounded-md p-2 transition-colors",
              "hover:bg-accent hover:text-accent-foreground"
            )}
            title="Export settings"
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            onClick={onThemeToggle}
            className={cn(
              "rounded-md p-2 transition-colors",
              "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {isDark ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>
          <button
            onClick={logout}
            className={cn(
              "rounded-md p-2 transition-colors",
              "hover:bg-accent hover:text-accent-foreground"
            )}
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;