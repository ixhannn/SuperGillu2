import { useEffect, useState } from 'react';
import { NativeShellService, type NativeShellState } from '../services/nativeShell';

export const useNativeShell = (): NativeShellState => {
  const [state, setState] = useState<NativeShellState>(() => NativeShellService.getState());

  useEffect(() => NativeShellService.subscribe(setState), []);

  return state;
};
