import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurTargetView } from 'expo-blur';

import FloatingTabBar, { TABS } from '../../components/FloatingTabBar';

function HiddenTabBar() {
  return null;
}

export default function TabsLayout() {
  const blurTarget = useRef(null);

  return (
    <View style={styles.container}>
      <BlurTargetView ref={blurTarget} style={styles.container}>
        <Tabs tabBar={HiddenTabBar} screenOptions={{ headerShown: false }}>
          {TABS.map((tab) => (
            <Tabs.Screen key={tab.href} name={tab.href.slice(1)} options={{ title: tab.title }} />
          ))}
        </Tabs>
      </BlurTargetView>
      <FloatingTabBar blurTarget={blurTarget} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
