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

export interface LocationSyncResult {
  success: boolean;
  location: UserLocationState | null;
  error: string | null;
  permissionDenied?: boolean;
  servicesDisabled?: boolean;
}

export const useLocation = () => {
  const [location, setLocation] = useState<UserLocationState | null>(null);
  const [permissionStatus, setPermissionStatus] =
    useState<LocationPermissionState>('undetermined');
  const [servicesEnabled, setServicesEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestAndSyncLocation = useCallback(async (): Promise<LocationSyncResult> => {
    setLoading(true);
    setError(null);

    try {
      // 1. Check whether location services are enabled on device
      const isServiceEnabled = await Location.hasServicesEnabledAsync();
      setServicesEnabled(isServiceEnabled);

      if (!isServiceEnabled) {
        const errMsg =
          'Location services are turned off. Please enable GPS / location services in your device settings.';
        setError(errMsg);
        return {
          success: false,
          location: null,
          error: errMsg,
          servicesDisabled: true,
        };
      }

      // 2. Check and request foreground permissions
      let { status } = await Location.getForegroundPermissionsAsync();

      if (status !== 'granted') {
        const permissionResponse = await Location.requestForegroundPermissionsAsync();
        status = permissionResponse.status;
      }

      if (status !== 'granted') {
        setPermissionStatus('denied');
        const errMsg =
          'Location permission is required to center the neighborhood map around your location.';
        setError(errMsg);
        return {
          success: false,
          location: null,
          error: errMsg,
          permissionDenied: true,
        };
      }

      setPermissionStatus('granted');

      // 3. Obtain current position (Foreground only, on-demand with 10s timeout protection)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error('Location request timed out. Please check your GPS signal and try again.')
            ),
          10000
        )
      );

      const position = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        timeoutPromise,
      ]);

      const { latitude, longitude, accuracy } = position.coords;

      // 4. Validate coordinates
      if (
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        const errMsg = 'Received invalid coordinates from location provider.';
        setError(errMsg);
        return {
          success: false,
          location: null,
          error: errMsg,
        };
      }

      const newLoc: UserLocationState = {
        latitude,
        longitude,
        accuracy: accuracy ?? null,
      };

      setLocation(newLoc);

      // 5. Sync to backend securely (JWT authentication)
      try {
        const backendRes = await updateCurrentLocation(newLoc);
        if (backendRes.success && backendRes.data?.updated_at) {
          newLoc.updated_at = backendRes.data.updated_at;
          setLocation((prev) =>
            prev ? { ...prev, updated_at: backendRes.data?.updated_at } : prev
          );
        }
      } catch (syncErr) {
        console.warn('Backend location sync warning:', syncErr);
      }

      return {
        success: true,
        location: newLoc,
        error: null,
      };
    } catch (err: any) {
      const errMsg =
        err?.message ||
        'Unable to determine your current location. Please check GPS and try again.';
      setError(errMsg);
      return {
        success: false,
        location: null,
        error: errMsg,
      };
    } finally {
      setLoading(false);
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
