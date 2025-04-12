import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<void>;
  logo: {
    type: 'image' | 'text';
    src?: string;
    alt?: string;
    width?: number;
    height?: number;
    text?: string;
  };
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

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, logo }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isDark = useState(getThemePreference)[0];
  const [imageError, setImageError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onLogin(username, password);
      navigate('/');
    } catch (err) {
      console.error(err);
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      "min-h-screen flex items-center justify-center",
      "bg-background text-foreground transition-colors duration-300",
      isDark ? "dark" : ""
    )}>
      <div className="max-w-md w-full space-y-8 p-8 bg-card rounded-lg shadow-lg">
        <div className="text-center">
          <div className="flex flex-col items-center gap-4">
            {logo.type === 'image' && logo.src && !imageError ? (
              <img
                src={logo.src}
                alt={logo.alt || logo.text || 'Logo'}
                width={logo.width || 64}
                height={logo.height || 64}
                className="mx-auto"
                onError={() => setImageError(true)}
              />
            ) : (
              <h1 className="text-4xl font-bold text-primary">
                {logo.text || logo.alt || 'OVOS'}
              </h1>
            )}
          </div>
          <h2 className="mt-6 text-2xl font-semibold text-foreground">
            Sign in to your account
          </h2>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="text-destructive text-sm text-center">{error}</div>
          )}
          
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-foreground">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={cn(
                  "mt-1 block w-full px-3 py-2 rounded-md",
                  "bg-input text-input-foreground border border-input",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50"
                )}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn(
                  "mt-1 block w-full px-3 py-2 rounded-md",
                  "bg-input text-input-foreground border border-input",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50"
                )}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full flex justify-center py-2 px-4 rounded-md",
              "text-sm font-medium text-primary-foreground",
              "bg-primary hover:bg-primary/90",
              "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}; 