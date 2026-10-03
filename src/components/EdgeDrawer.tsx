import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useColors } from '@/theme';

export const EDGE_WIDTH = 26;

type Side = 'left' | 'right';

/**
 * Thin strip along a screen edge. Dragging inward drives `progress` (0..1) of the
 * matching drawer; the rest of the screen keeps its normal reader gestures.
 */
export function EdgeZone({
  side,
  drawerWidth,
  progress,
  onOpen,
}: {
  side: Side;
  drawerWidth: number;
  progress: SharedValue<number>;
  onOpen: () => void;
}) {
  const gesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-24, 24])
    .onUpdate((e) => {
      const d = side === 'left' ? e.translationX : -e.translationX;
      progress.value = Math.max(0, Math.min(1, d / drawerWidth));
    })
    .onEnd((e) => {
      const v = side === 'left' ? e.velocityX : -e.velocityX;
      if (progress.value > 0.3 || v > 500) {
        scheduleOnRN(onOpen);
      } else {
        progress.value = withTiming(0, { duration: 160 });
      }
    });

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.zone, side === 'left' ? { left: 0 } : { right: 0 }]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />
    </GestureDetector>
  );
}

export function EdgeDrawer({
  side,
  width,
  progress,
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  side: Side;
  width: number;
  progress: SharedValue<number>;
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();

  const closeGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-24, 24])
    .onUpdate((e) => {
      const d = side === 'left' ? -e.translationX : e.translationX;
      progress.value = Math.max(0, Math.min(1, 1 - d / width));
    })
    .onEnd((e) => {
      const v = side === 'left' ? -e.velocityX : e.velocityX;
      if (progress.value < 0.65 || v > 600) {
        scheduleOnRN(onClose);
      } else {
        progress.value = withTiming(1, { duration: 160 });
      }
    });

  const panelStyle = useAnimatedStyle(() => {
    const hidden = (1 - progress.value) * width;
    return { transform: [{ translateX: side === 'left' ? -hidden : hidden }] };
  });
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.5 }));

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]} pointerEvents={open ? 'auto' : 'box-none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, scrimStyle]} pointerEvents="none" />
      {open ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={`Close ${title}`}
          accessibilityRole="button"
        />
      ) : null}
      <GestureDetector gesture={closeGesture}>
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[
            styles.panel,
            side === 'left' ? { left: 0 } : { right: 0 },
            {
              width,
              backgroundColor: c.surface,
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 12,
              borderColor: c.border,
              elevation: open ? 16 : 0,
            },
            panelStyle,
          ]}
          accessibilityViewIsModal={open}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.text }]}>{title}</Text>
            {subtitle ? <Text style={{ color: c.textMuted, fontSize: 13 }}>{subtitle}</Text> : null}
          </View>
          <View style={{ flex: 1 }}>{children}</View>
          {footer}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: { position: 'absolute', top: 0, bottom: 0, width: EDGE_WIDTH, zIndex: 5 },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    elevation: 0,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 2 },
  title: { fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
});
