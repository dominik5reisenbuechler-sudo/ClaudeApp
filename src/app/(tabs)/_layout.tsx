import { View } from 'react-native';
import { Tabs } from 'expo-router';

import { useTheme } from '@/theme/ThemeProvider';

/**
 * The five product areas (CLAUDE.md §4).
 *
 * No icon set is installed, and adding one purely for decoration would be an
 * unnecessary dependency. The bar uses labels with a small focus indicator,
 * which suits the minimal design language. Swapping in icons later is a change
 * to `tabBarIcon` alone.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: theme.fontSize.xs,
          fontWeight: theme.fontWeight.semibold,
        },
        tabBarIcon: ({ focused }) => (
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 2.5,
              marginBottom: 2,
              backgroundColor: focused ? theme.colors.accent : 'transparent',
            }}
          />
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="training" options={{ title: 'Training' }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Nutrition' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      {/*
        The coach is a route, not a sixth tab. The spec fixes five product
        areas (PRODUCT_SPEC.md §4.1), and a tab is a claim about how central
        something is — the coach answers questions about the other five rather
        than being one of them. Reached from the dashboard and from Profile.
      */}
      <Tabs.Screen name="coach" options={{ href: null }} />
    </Tabs>
  );
}
