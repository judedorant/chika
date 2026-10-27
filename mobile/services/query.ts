import { QueryClient } from "@tanstack/react-query";
import axios from "axios";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,
      retry: (count, error) =>
        count < 2 &&
        (!axios.isAxiosError(error) ||
          !error.response ||
          error.response.status >= 500),
    },
    mutations: { retry: false },
  },
});
