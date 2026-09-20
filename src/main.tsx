import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ApiError } from "./api/client";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: (count, error) => error instanceof ApiError ? error.status === 429 && count < 1 : count < 3,
      retryDelay: (attempt, error) => error instanceof ApiError && error.retryAfterSeconds
        ? error.retryAfterSeconds * 1_000
        : Math.min(1_000 * 2 ** attempt, 5_000),
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
