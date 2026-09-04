import React, { createContext, useContext, useEffect } from "react";

type Theme = "dark";

type ThemeContextType = {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  switchable: false,
});

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
  defaultTheme?: string;
  switchable?: boolean;
}) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    try {
      window.localStorage.setItem("theme", "dark");
    } catch (_err) {
      /* ignore */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark", switchable: false }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
