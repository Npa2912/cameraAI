import { useCallback, useEffect, useState } from "react";
import { BackHandler } from "react-native";

export type Tab = "home" | "events" | "storage" | "settings";
export type Route =
  Tab | "add" | "live" | "deviceSettings" | "multi" | "playback" | "photos";

export function useNavigation() {
  const [history, setHistory] = useState<Route[]>(["home"]);
  const route = history[history.length - 1];
  const setRoute = useCallback((next: Route) => {
    setHistory((previous) => {
      if (next === previous[previous.length - 1]) return previous;
      if (next === "home") return ["home"];
      if (next === "events" || next === "storage" || next === "settings")
        return ["home", next];
      return [...previous, next];
    });
  }, []);
  const back = useCallback(() => {
    if (history.length < 2) return false;
    setHistory((previous) => previous.slice(0, -1));
    return true;
  }, [history.length]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      back,
    );
    return () => subscription.remove();
  }, [back]);

  return { route, setRoute, back };
}
