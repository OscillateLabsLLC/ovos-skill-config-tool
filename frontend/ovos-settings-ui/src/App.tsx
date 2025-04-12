import './App.css'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/auth'
import { LoginPage } from '@/components/LoginPage'
import SkillConfigurator from '@/components/SkillConfigurator'
import { useEffect, useState } from 'react'

interface LogoConfig {
  type: 'image' | 'text';
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  text?: string;
}

const defaultLogo: LogoConfig = {
  type: 'text',
  text: 'OVOS'
};

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

function AppContent() {
  const { isAuthenticated, login } = useAuth();
  const [logo, setLogo] = useState<LogoConfig>(defaultLogo);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/config.json');
        if (response.ok) {
          const data = await response.json();
          if (data.logo) {
            setLogo(data.logo);
          }
        }
      } catch (error) {
        console.warn('Failed to load config.json, using defaults');
        console.error(error);
      }
    };
    loadConfig();
  }, []);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/" />
          ) : (
            <LoginPage
              onLogin={login}
              logo={logo}
            />
          )
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <SkillConfigurator logo={logo} />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App
