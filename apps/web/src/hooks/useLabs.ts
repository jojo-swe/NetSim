import { useCallback, useEffect, useState } from "react";
import { type ApiClient } from "../api";
import { type LabDefinition, type LabValidationResult } from "../types";

export function useLabs(api: ApiClient) {
  const [labs, setLabs] = useState<LabDefinition[]>([]);
  const [selectedLabId, setSelectedLabId] = useState<string>("ccna-001");
  const [validation, setValidation] = useState<LabValidationResult | null>(null);
  const [validating, setValidating] = useState<boolean>(false);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await api.loadLabs();
        setLabs(loaded);
        if (loaded.length > 0) {
          setSelectedLabId((prev) => (loaded.some((l) => l.id === prev) ? prev : loaded[0].id));
        }
      } catch {}
    })();
  }, [api]);

  const validateSelectedLab = useCallback(async () => {
    setValidating(true);
    try {
      const result = await api.validateLab(selectedLabId);
      setValidation(result);
    } catch {
      setValidation(null);
    } finally {
      setValidating(false);
    }
  }, [api, selectedLabId]);

  return {
    labs,
    selectedLabId,
    setSelectedLabId,
    validation,
    setValidation,
    validating,
    validateSelectedLab,
  };
}
