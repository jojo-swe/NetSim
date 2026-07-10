import { useCallback, useEffect, useState } from "react";
import { type ApiClient } from "../api";

export function useDevices(api: ApiClient, selectedDeviceId: string | null) {
  const [devicesById, setDevicesById] = useState<Record<string, any>>({});

  const refreshDevices = useCallback(async () => {
    try {
      const next = await api.refreshDevices();
      setDevicesById(next);
    } catch {}
  }, [api]);

  useEffect(() => {
    if (!selectedDeviceId) return;
    void refreshDevices();
  }, [refreshDevices, selectedDeviceId]);

  return { devicesById, setDevicesById, refreshDevices };
}
