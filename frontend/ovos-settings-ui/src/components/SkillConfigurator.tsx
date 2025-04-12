import React, { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Settings, Eye, EyeOff } from "lucide-react";
import { siGithub } from "simple-icons";
import { cn } from "@/lib/utils";
import { Header } from "./Header";
import SettingEditor from "./SettingEditor";
import NewSettingEditor from "./NewSettingEditor";
import { useAuth } from "@/lib/auth";

interface LogoConfig {
  type: 'image' | 'text';
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  text?: string;
}

export interface SkillSetting {
  id: string;
  settings: Record<string, any>;
}

const getThemePreference = () => {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("theme-preference");
    if (stored) {
      return stored === "dark";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return false;
};

const getHideEmptySkillsPreference = () => {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("hide-empty-skills-preference");
    return stored === "true"; // Default to false if not found or invalid
  }
  return false;
};

interface SkillConfiguratorProps {
  logo: LogoConfig;
}

export const SkillConfigurator: React.FC<SkillConfiguratorProps> = ({ logo }) => {
  const { getAuthHeader } = useAuth();
  const [isDark, setIsDark] = useState(getThemePreference);
  const [skills, setSkills] = useState<SkillSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideEmptySkills, setHideEmptySkills] = useState(getHideEmptySkillsPreference);

  useEffect(() => {
    const stored = localStorage.getItem("theme-preference");
    if (!stored) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
        document.documentElement.classList.toggle("dark", e.matches);
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme-preference", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("hide-empty-skills-preference", String(hideEmptySkills));
    }
  }, [hideEmptySkills]);

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const authHeader = getAuthHeader();
        const response = await fetch("/api/v1/skills", {
          headers: authHeader ? {
            'Authorization': authHeader
          } : undefined,
          credentials: 'include'
        });
        if (!response.ok) throw new Error("Failed to fetch skills");
        const data = await response.json();

        const processedData = data
          .map((skill: SkillSetting) => ({
            ...skill,
            settings: Object.fromEntries(
              Object.entries(skill.settings)
                .filter(([key]: [string, any]) => key !== "__mycroft_skill_firstrun")
                .sort(([a]: [string, any], [b]: [string, any]) => a.localeCompare(b))
            ),
          }))
          .sort((a: SkillSetting, b: SkillSetting) =>
            getSkillInfo(a.id).name.localeCompare(getSkillInfo(b.id).name)
          );

        setSkills(processedData);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSkills();
  }, [getAuthHeader]);

  const toggleTheme = () => setIsDark((prev) => !prev);
  const toggleHideEmptySkills = () => setHideEmptySkills((prev) => !prev);

  const handleDeleteSetting = async (skillId: string, keyToDelete: string) => {
    try {
      const authHeader = getAuthHeader();
      // First get current settings
      const response = await fetch(`/api/v1/skills/${skillId}`, {
        headers: authHeader ? {
          'Authorization': authHeader
        } : undefined,
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch current settings');
      }
      const currentData = await response.json();
      
      // Create new settings object without the key to delete
      const newSettings = Object.fromEntries(
        Object.entries(currentData.settings)
          .filter(([key]) => key !== keyToDelete)
      );

      // Replace all settings with the new object
      const deleteResponse = await fetch(`/api/v1/skills/${skillId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { 'Authorization': authHeader } : {})
        },
        credentials: 'include',
        body: JSON.stringify(newSettings),
      });

      if (!deleteResponse.ok) {
        throw new Error('Failed to delete setting');
      }

      const result = await deleteResponse.json();

      // Update local state using the same filtering logic
      setSkills(currentSkills => 
        currentSkills.map(skill => {
          if (skill.id === skillId) {
            return {
              ...skill,
              settings: Object.fromEntries(
                Object.entries(result.settings)
                  .filter(([key]) => key !== '__mycroft_skill_firstrun')
                  .sort(([a], [b]) => a.localeCompare(b))
              )
            };
          }
          return skill;
        })
      );
    } catch (error) {
      console.error('Error deleting setting:', error);
      throw error;
    }
  };
  const handleSaveSetting = async (skillId: string, key: string, value: any) => {
    try {
      const authHeader = getAuthHeader();
      const response = await fetch(`/api/v1/skills/${skillId}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { 'Authorization': authHeader } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          [key]: value
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save setting');
      }

      const result = await response.json();

      // Update local state using the same filtering logic as initial load
      setSkills(currentSkills => 
        currentSkills.map(skill => {
          if (skill.id === skillId) {
            return {
              ...skill,
              settings: Object.fromEntries(
                Object.entries(result.settings)
                  .filter(([key]) => key !== '__mycroft_skill_firstrun')
                  .sort(([a], [b]) => a.localeCompare(b))
              )
            };
          }
          return skill;
        })
      );
    } catch (error) {
      console.error('Error saving setting:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Settings className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="text-destructive p-4">{error}</div>;
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-background text-foreground transition-colors duration-300",
        isDark ? "dark" : ""
      )}
    >
      <Header 
        isDark={isDark} 
        onThemeToggle={toggleTheme} 
        skills={skills}
        logo={logo}
      />

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Skill Settings</h2>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/OscillateLabsLLC/ovos-skill-config-tool/issues"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                "bg-primary/10 text-primary hover:bg-primary/20",
                "flex items-center gap-2"
              )}
            >
              <svg
                role="img"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="currentColor"
                dangerouslySetInnerHTML={{ __html: siGithub.svg }}
              />
              Report Issue
            </a>
            <button
              onClick={toggleHideEmptySkills}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                "bg-primary/10 text-primary hover:bg-primary/20",
                "flex items-center gap-2"
              )}
            >
              {hideEmptySkills ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {hideEmptySkills ? "Show Empty Skills" : "Hide Empty Skills"}
            </button>
          </div>
        </div>
        <Accordion type="single" collapsible className="space-y-2">
          {skills
            .filter(skill => !hideEmptySkills || Object.keys(skill.settings).length > 0)
            .sort((a, b) => {
              const aEmpty = Object.keys(a.settings).length === 0;
              const bEmpty = Object.keys(b.settings).length === 0;
              if (aEmpty && !bEmpty) return 1;
              if (!aEmpty && bEmpty) return -1;
              return getSkillInfo(a.id).name.localeCompare(getSkillInfo(b.id).name);
            })
            .map((skill) => {
              const { name, author } = getSkillInfo(skill.id);
              const settingsCount = Object.keys(skill.settings).length;

              return (
                <AccordionItem
                  key={skill.id}
                  value={skill.id}
                  className={cn(
                    "rounded-lg border shadow-sm",
                    "transition-colors duration-200",
                    "bg-card text-card-foreground",
                    "hover:bg-accent/50",
                    settingsCount === 0 && "opacity-60"
                  )}
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-3 w-full">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <Settings className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-semibold">{name}</div>
                        <div className="text-sm text-muted-foreground">
                          by {author} • {settingsCount} settings
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-4 pt-2">
                      {Object.entries(skill.settings).map(([key, value]) => (
                        <div
                          key={key}
                          className="border-b border-border pb-3 last:border-0"
                        >
                          <SettingEditor
                            settingKey={key}
                            value={value}
                            onSave={async (key, newValue) => {
                              await handleSaveSetting(skill.id, key, newValue);
                            }}
                            onDelete={async (key) => {
                              await handleDeleteSetting(skill.id, key);
                            }}
                          />
                        </div>
                      ))}
                      <div className="pt-2">
                        <NewSettingEditor
                          onSave={async (key, value) => {
                            await handleSaveSetting(skill.id, key, value);
                          }}
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
        </Accordion>
      </main>

      <footer className="text-center p-4 text-sm text-muted-foreground">
        <p>
          Made with 🤓 ❤️ by <a href="https://oscillatelabs.net" target="_blank" rel="noopener noreferrer" className="hover:underline">Oscillate Labs</a> (Copyright 2025)
        </p>
        <p className="mt-1">
          <a 
            href="https://github.com/OscillateLabsLLC/ovos-skill-config-tool/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            View License (Apache 2.0)
          </a>
        </p>
      </footer>
    </div>
  );
};

const getSkillInfo = (skillId: string) => {
  const parts = skillId.split(".");
  const author = parts.length > 1 ? parts[parts.length - 1] : "unknown";
  const nameWithPrefix = parts.slice(0, -1).join(".") || skillId;
  let name = nameWithPrefix
    .replace(/^(skill-|ovos-skill-|ovos-)/, "")
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  if (!nameWithPrefix.search("skill")) {
    name = name + " Skill";
  }
  return { name, author };
};

export default SkillConfigurator;
