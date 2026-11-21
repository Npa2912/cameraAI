import { useCallback, useEffect, useState } from "react";
import { BackHandler } from "react-native";

export type Tab = "home" | "events" | "storage" | "settings";
export type Route = Tab | "add" | "live" | "deviceSettings";

export function useNavigation() {
  const [route, setRoute] = useState<Route>("home");
  const back = useCallback(() => {
    if (route === "home") return false;
    setRoute(route === "deviceSettings" ? "live" : "home");
    return true;
  }, [route]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      back,
    );
    return () => subscription.remove();
  }, [back]);

  return { route, setRoute, back };
}
