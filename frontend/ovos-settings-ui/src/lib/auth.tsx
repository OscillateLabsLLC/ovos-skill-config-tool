import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  getAuthHeader: () => string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [authHeader, setAuthHeader] = useState<string | null>(null);

  // Check initial auth state from localStorage
  useEffect(() => {
    const storedHeader = localStorage.getItem('authHeader');
    if (storedHeader) {
      setAuthHeader(storedHeader);
    }
  }, []);

  // Update localStorage when authHeader changes
  useEffect(() => {
    if (authHeader) {
      localStorage.setItem('authHeader', authHeader);
    } else {
      localStorage.removeItem('authHeader');
    }
  }, [authHeader]);

  useEffect(() => {
    // Check if we're already authenticated
    const checkAuth = async () => {
      if (!authHeader) {
        setIsAuthenticated(false);
        setUsername(null);
        return;
      }

      try {
        const response = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: {
            'Authorization': authHeader
          },
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          setIsAuthenticated(true);
          setUsername(data.username);
        } else {
          setAuthHeader(null);
          setIsAuthenticated(false);
          setUsername(null);
        }
      } catch (error) {
        console.error(error);
        setAuthHeader(null);
        setIsAuthenticated(false);
        setUsername(null);
      }
    };
    checkAuth();
  }, [authHeader]);

  const login = async (username: string, password: string) => {
    const header = `Basic ${btoa(`${username}:${password}`)}`;
    
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Authorization': header
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Authentication failed');
    }

    const data = await response.json();
    setAuthHeader(header);
    setIsAuthenticated(true);
    setUsername(data.username);
  };

  const logout = () => {
    setAuthHeader(null);
    setIsAuthenticated(false);
    setUsername(null);
  };

  const getAuthHeader = () => authHeader;

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, login, logout, getAuthHeader }}>
      {children}
    </AuthContext.Provider>
  );
};
