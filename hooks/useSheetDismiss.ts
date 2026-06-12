import React from 'react';
import { useDragControls, type PanInfo } from 'framer-motion';

/**
 * useSheetDismiss — physical drag-to-dismiss for bottom sheets.
 *
 * Spread `sheetDragProps` on the sheet's root <motion.div> and `handleProps`
 * on its grab-handle row. The drag session only starts from the handle, so
 * sheets with text inputs stay safe while the keyboard is up — exactly how
 * system bottom sheets behave on Android and iOS.
 */

const DISMISS_DISTANCE_PX = 90;
const DISMISS_VELOCITY = 500;

export function useSheetDismiss(onClose: () => void) {
  const dragControls = useDragControls();

  const onDragEnd = React.useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_DISTANCE_PX || info.velocity.y > DISMISS_VELOCITY) onClose();
  }, [onClose]);

  const onPointerDown = React.useCallback((e: React.PointerEvent) => {
    dragControls.start(e);
  }, [dragControls]);

  return {
    sheetDragProps: {
      drag: 'y' as const,
      dragListener: false,
      dragControls,
      dragConstraints: { top: 0, bottom: 0 },
      dragElastic: { top: 0, bottom: 0.9 },
      onDragEnd,
    },
    handleProps: {
      onPointerDown,
      style: { touchAction: 'none' as const },
    },
  };
}
