import { useQuery } from "@tanstack/react-query";
import { get } from "./api";

type Terms = {
  version: string;
  title: string;
  sections: { title: string; paragraphs: string[] }[];
};

export function useTerms(enabled = true) {
  return useQuery<Terms>({
    queryKey: ["legal", "terms"],
    queryFn: () => get("legal/terms"),
    enabled,
  });
}

export const localLegalPreview = ["localhost", "127.0.0.1", "[::1]"].includes(
  window.location.hostname,
);
