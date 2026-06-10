import { getConsoleFunction, setConsoleFunction } from 'three';

let installed = false;

export const installThreeWarningFilter = (): void => {
  if (installed) return;
  installed = true;

  const delegate = getConsoleFunction();
  setConsoleFunction((type, message, ...params) => {
    if (
      type === 'warn'
      && typeof message === 'string'
      && message.includes('THREE.Clock: This module has been deprecated')
    ) {
      return;
    }
    delegate(type, message, ...params);
  });
};
