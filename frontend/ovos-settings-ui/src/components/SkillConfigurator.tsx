import React, { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Header } from "./Header";
import SettingEditor from "./SettingEditor";
import NewSettingEditor from "./NewSettingEditor";

interface SkillSetting {
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

export const SkillConfigurator: React.FC = () => {
  const [isDark, setIsDark] = useState(getThemePreference);
  const [skills, setSkills] = useState<SkillSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const fetchSkills = async () => {
      try {
        const response = await fetch("/api/v1/skills");
        if (!response.ok) throw new Error("Failed to fetch skills");
        const data = await response.json();

        const processedData = data
          .map((skill) => ({
            ...skill,
            settings: Object.fromEntries(
              Object.entries(skill.settings)
                .filter(([key]) => key !== "__mycroft_skill_firstrun")
                .sort(([a], [b]) => a.localeCompare(b))
            ),
          }))
          .sort((a, b) =>
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
  }, []);

  const toggleTheme = () => setIsDark((prev) => !prev);

  const handleDeleteSetting = async (skillId: string, keyToDelete: string) => {
    try {
      // First get current settings
      const response = await fetch(`/api/v1/skills/${skillId}`);
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
        },
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
      const response = await fetch(`/api/v1/skills/${skillId}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      <Header isDark={isDark} onThemeToggle={toggleTheme} skills={skills} />

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <Accordion type="single" collapsible className="space-y-2">
          {skills.map((skill) => {
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
                  "hover:bg-accent/50"
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
