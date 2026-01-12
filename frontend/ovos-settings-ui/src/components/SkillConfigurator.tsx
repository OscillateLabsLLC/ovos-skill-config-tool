import React, { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Settings, Eye, EyeOff, Undo2 } from "lucide-react";
import { siGithub } from "simple-icons";
import { cn } from "@/lib/utils";
import { Header } from "./Header";
import SettingEditor from "./SettingEditor";
import NewSettingEditor from "./NewSettingEditor";
import { useAuth } from "@/lib/auth";
import { produce } from 'immer';

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
  settings: Record<string, unknown>;
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
  const [previousSettings, setPreviousSettings] = useState<Record<string, Record<string, unknown> | null>>({}); // State for undo

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
                .filter(([key]: [string, unknown]) => key !== "__mycroft_skill_firstrun")
                .sort(([a]: [string, unknown], [b]: [string, unknown]) => a.localeCompare(b))
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

  // --- Path-Based Update Handlers using Immer --- 

  const handleSaveSettingWithPath = async (skillId: string, path: (string | number)[], value: unknown) => {
    console.log("Save Attempt:", { skillId, path, value });
    let originalSettings: Record<string, unknown> | null = null; // To store pre-change state
    let skillIndex = -1;

    try {
      // Find original settings before producing the next state
      const currentSkill = skills.find(s => s.id === skillId);
      if (currentSkill) {
          originalSettings = JSON.parse(JSON.stringify(currentSkill.settings)); // Deep copy
      }

      const nextSkills = produce(skills, draftSkills => {
        skillIndex = draftSkills.findIndex(s => s.id === skillId);
        if (skillIndex === -1) {
          console.error("Skill not found for saving:", skillId);
          throw new Error("Skill not found");
        }
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let currentLevel: any = draftSkills[skillIndex].settings;
        for (let i = 0; i < path.length - 1; i++) {
          const segment = path[i];
          if (currentLevel[segment] === undefined || currentLevel[segment] === null) {
             console.error("Invalid path segment during save:", segment, "in path", path);
             throw new Error("Invalid setting path");
          }
          currentLevel = currentLevel[segment];
        }

        const finalKey = path[path.length - 1];
        console.log(`Assigning to draft[${skillIndex}].settings[${finalKey}]:`, value, typeof value);
        currentLevel[finalKey] = value;
      });

      // Record previous state *before* setting the new state
      if (originalSettings) {
          setPreviousSettings(prev => ({ ...prev, [skillId]: originalSettings }));
      }

      // Optimistically update local state
      setSkills(nextSkills);
      
      if (skillIndex === -1 || !nextSkills[skillIndex]) {
          throw new Error("Skill not found in updated state.");
      }
      const finalSettingsToSend = nextSkills[skillIndex].settings;

      // Persist changes to the backend
      const authHeader = getAuthHeader();
      const response = await fetch(`/api/v1/skills/${skillId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { 'Authorization': authHeader } : {})
        },
        credentials: 'include',
        body: JSON.stringify(finalSettingsToSend),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to save settings to API: ${response.status} ${errorBody}`);
      }
      
    } catch (error) {
      console.error('Error saving setting:', error);
      setError(error instanceof Error ? error.message : "Save failed");
    }
  };

  const handleDeleteSettingWithPath = async (skillId: string, path: (string | number)[]) => {
    console.log("Delete Attempt:", { skillId, path });
    let originalSettings: Record<string, unknown> | null = null; // To store pre-change state
    let skillIndex = -1;
    
    if (path.length === 0) {
       console.error("Cannot delete with empty path");
       setError("Cannot delete root setting");
       return;
    }

    try {
      // Find original settings before producing the next state
      const currentSkill = skills.find(s => s.id === skillId);
      if (currentSkill) {
          originalSettings = JSON.parse(JSON.stringify(currentSkill.settings)); // Deep copy
      }

      const nextSkills = produce(skills, draftSkills => {
        skillIndex = draftSkills.findIndex(s => s.id === skillId);
        if (skillIndex === -1) {
          console.error("Skill not found for deleting:", skillId);
          throw new Error("Skill not found");
        }
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parentLevel: any = draftSkills[skillIndex].settings;
        for (let i = 0; i < path.length - 1; i++) {
           const segment = path[i];
           if (parentLevel[segment] === undefined || parentLevel[segment] === null) {
              console.error("Invalid path segment during delete:", segment, "in path", path);
              throw new Error("Invalid setting path");
           }
           parentLevel = parentLevel[segment];
        }

        const finalKeyOrIndex = path[path.length - 1];
        if (Array.isArray(parentLevel) && typeof finalKeyOrIndex === 'number') {
          parentLevel.splice(finalKeyOrIndex, 1);
        } else if (typeof parentLevel === 'object' && parentLevel !== null && typeof finalKeyOrIndex === 'string') {
          delete parentLevel[finalKeyOrIndex];
        } else {
           console.error("Invalid target for delete:", { parentLevel, finalKeyOrIndex });
           throw new Error("Cannot delete from target");
        }
      });

      // Record previous state *before* setting the new state
      if (originalSettings) {
          setPreviousSettings(prev => ({ ...prev, [skillId]: originalSettings }));
      }

      // Optimistically update local state
      setSkills(nextSkills);
      
      if (skillIndex === -1 || !nextSkills[skillIndex]) {
          throw new Error("Skill not found in updated state after delete.");
      }
      const finalSettingsToSend = nextSkills[skillIndex].settings;

      // Persist changes to the backend
      const authHeader = getAuthHeader();
      const response = await fetch(`/api/v1/skills/${skillId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { 'Authorization': authHeader } : {})
        },
        credentials: 'include',
        body: JSON.stringify(finalSettingsToSend),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to save settings to API after delete: ${response.status} ${errorBody}`);
      }

    } catch (error) {
      console.error('Error deleting setting:', error);
      setError(error instanceof Error ? error.message : "Delete failed");
    }
  };

  // --- Undo Handler --- 
  const handleUndoChange = async (skillId: string) => {
      const settingsToRestore = previousSettings[skillId];
      if (!settingsToRestore) return; // No history for this skill
      
      console.log("Undo Attempt:", { skillId, settingsToRestore });
      
      // Optimistically update local state with restored settings
      const nextSkills = produce(skills, draftSkills => {
          const skillIndex = draftSkills.findIndex(s => s.id === skillId);
          if (skillIndex !== -1) {
              draftSkills[skillIndex].settings = settingsToRestore;
          }
      });
      setSkills(nextSkills);
      
      // Clear the stored previous state for this skill
      setPreviousSettings(prev => ({ ...prev, [skillId]: null }));
      
      // Persist the restored state to the backend
      try {
          const authHeader = getAuthHeader();
          const response = await fetch(`/api/v1/skills/${skillId}`, { // POST replaces entire settings object
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authHeader ? { 'Authorization': authHeader } : {})
            },
            credentials: 'include',
            body: JSON.stringify(settingsToRestore),
          });
          
          if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to save undone settings to API: ${response.status} ${errorBody}`);
          }
          console.log("Undo successful and saved to API for", skillId);
      } catch(error) {
          console.error('Error saving undone state:', error);
          setError(error instanceof Error ? error.message : "Undo save failed");
          // Consider: Should we restore the previousSettings entry if API fails?
          // setPreviousSettings(prev => ({ ...prev, [skillId]: settingsToRestore }));
          // Consider: Should we revert the optimistic state update?
          // fetchSkills(); // Or revert locally?
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
                    <div className="flex justify-end mb-2">
                       <button
                          onClick={() => handleUndoChange(skill.id)}
                          disabled={!previousSettings[skill.id]}
                          className={cn(
                              "flex items-center gap-1 text-xs px-2 py-1 rounded",
                              "bg-amber-600/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400",
                              "hover:bg-amber-600/20 dark:hover:bg-amber-400/20",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                          title="Undo Single Last Change (per skill)"
                        >
                          <Undo2 size={14} /> Undo Change
                        </button>
                    </div>
                    <div className="space-y-4 pt-2 border-t">
                      {Object.entries(skill.settings).map(([key, value]) => {
                        const initialPath = [key];
                        return (
                          <div
                            key={key}
                            className="border-b border-border pb-3 last:border-0"
                          >
                            <SettingEditor
                              path={initialPath}
                              value={value}
                              onSave={(path, val) => handleSaveSettingWithPath(skill.id, path, val)}
                              onDelete={(path) => handleDeleteSettingWithPath(skill.id, path)}
                            />
                          </div>
                        );
                      })}
                      <div className="pt-2 border-t">
                         <NewSettingEditor 
                           onSave={async (key, value) => { 
                             await handleSaveSettingWithPath(skill.id, [key], value);
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
