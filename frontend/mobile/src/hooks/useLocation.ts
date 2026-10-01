import { useState, useCallback } from 'react';
import * as Location from 'expo-location';
import { updateCurrentLocation } from '../api/client';

export type LocationPermissionState = 'undetermined' | 'granted' | 'denied';

export interface UserLocationState {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updated_at?: string;
}

export const useLocation = () => {
  const [location, setLocation] = useState<UserLocationState | null>(null);
  const [permissionStatus, setPermissionStatus] =
    useState<LocationPermissionState>('undetermined');
  const [servicesEnabled, setServicesEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestAndSyncLocation = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      // 1. Check whether location services are enabled on device
      const isServiceEnabled = await Location.hasServicesEnabledAsync();
      setServicesEnabled(isServiceEnabled);

      if (!isServiceEnabled) {
        setError(
          'Location services are turned off. Please enable GPS / location services in your device settings.'
        );
        setLoading(false);
        return false;
      }

      // 2. Check and request foreground permissions
      let { status } = await Location.getForegroundPermissionsAsync();

      if (status !== 'granted') {
        const permissionResponse = await Location.requestForegroundPermissionsAsync();
        status = permissionResponse.status;
      }

      if (status !== 'granted') {
        setPermissionStatus('denied');
        setError(
          'Location permission is required to center the neighborhood map around your location.'
        );
        setLoading(false);
        return false;
      }

      setPermissionStatus('granted');

      // 3. Obtain current position (Foreground only, on-demand)
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude, accuracy } = position.coords;

      // 4. Validate coordinates
      if (
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        setError('Received invalid coordinates from location provider.');
        setLoading(false);
        return false;
      }

      const newLoc: UserLocationState = {
        latitude,
        longitude,
        accuracy: accuracy ?? null,
      };

      setLocation(newLoc);

      // 5. Sync to backend securely (JWT authentication)
      const backendRes = await updateCurrentLocation(newLoc);
      if (backendRes.success && backendRes.data) {
        setLocation((prev) => (prev ? { ...prev, updated_at: backendRes.data?.updated_at } : prev));
      }

      setLoading(false);
      return true;
    } catch (err: any) {
      setError(
        err.message ||
          'Unable to determine your current location. Please check GPS and try again.'
      );
      setLoading(false);
      return false;
    }
  }, []);

  return {
    location,
    permissionStatus,
    servicesEnabled,
    loading,
    error,
    requestAndSyncLocation,
    setLocation,
  };
};
