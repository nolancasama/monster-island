import { create } from "zustand";
import { debugEnabled } from "./debugAccess";

export const useDebug = create(() => ({ open: false, noclip: false, invincible: false, collision: false }));
export const debugPaused = () => debugEnabled && useDebug.getState().open;
