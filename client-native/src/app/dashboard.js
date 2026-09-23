import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { getMe } from '../services/api';

// Format DOB nicely if it's DD/MM/YYYY
function formatDOB(dob) {
  if (!dob) return '—';
  const parts = dob.split(/[\/\-]/);
  if (parts.length === 3) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parts[2];
    return `${day} ${months[month]} ${year}`;
  }
  return dob;
}

function genderLabel(g) {
  if (!g) return '—';
  const map = { M: 'Male', F: 'Female', T: 'Transgender' };
  return map[g.toUpperCase()] || g;
}

// Stat Card component
function StatCard({ icon, label, value }) {
  return (
    <View style={statStyles.card}>
      <Text style={statStyles.icon}>{icon}</Text>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={statStyles.value}>{value || '—'}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    minWidth: 140,
    margin: 6,
  },
  icon: { fontSize: 24 },
  label: { fontSize: 11, color: '#8888aa', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 },
  value: { fontSize: 15, color: '#ffffff', fontWeight: '700', textAlign: 'center' },
});

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const doSignOut = useCallback(async () => {
    try {
      await GoogleSignin.signOut();
    } catch (_) {}
    await SecureStore.deleteItemAsync('authToken');
    await SecureStore.deleteItemAsync('user');
    router.replace('/auth');
  }, [router]);

  const handleSignOut = useCallback(
    async (silent = false) => {
      if (!silent) {
        Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign Out',
            style: 'destructive',
            onPress: async () => {
              await doSignOut();
            },
          },
        ]);
      } else {
        await doSignOut();
      }
    },
    [doSignOut]
  );

  const loadUser = useCallback(async () => {
    try {
      // Try cached first for instant display
      const cached = await SecureStore.getItemAsync('user');
      if (cached) setUser(JSON.parse(cached));

      // Then refresh from server
      const fresh = await getMe();
      setUser(fresh);
      await SecureStore.setItemAsync('user', JSON.stringify(fresh));
    } catch (err) {
      // If token expired, force logout
      if (err?.response?.status === 401) {
        handleSignOut(true);
      }
    } finally {
      setLoading(false);
    }
  }, [handleSignOut]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUser();
  }, [loadUser]);

  if (loading && !user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#0B7A4B" size="large" />
      </View>
    );
  }

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.googleEmail?.[0]?.toUpperCase() || '?';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {/* Decorative blobs */}
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.greeting}>
              👋 Hello,{' '}
              <Text style={styles.greetingName}>
                {user?.name ? user.name.split(' ')[0] : 'User'}
              </Text>
            </Text>
            <Text style={styles.greetingDate}>
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </Text>
          </View>
          <Pressable
            onPress={() => handleSignOut()}
            style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        {/* ── Profile card ─────────────────────────────────────────────── */}
        <View style={styles.profileCard}>
          {user?.googleAvatar ? (
            <Image source={{ uri: user.googleAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}

          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'Name not set'}</Text>
            <Text style={styles.profileEmail}>{user?.googleEmail}</Text>

            <View style={styles.verifiedBadge}>
              {user?.isAadhaarVerified ? (
                <>
                  <Text style={styles.verifiedDot}>✅</Text>
                  <Text style={styles.verifiedText}>Aadhaar Verified</Text>
                </>
              ) : (
                <>
                  <Text style={styles.verifiedDot}>⚠️</Text>
                  <Text style={[styles.verifiedText, { color: '#f59e0b' }]}>
                    Aadhaar Pending
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* ── KYC Details ──────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Identity Details</Text>
        <View style={styles.statsGrid}>
          <StatCard icon="🎂" label="Date of Birth" value={formatDOB(user?.dob)} />
          <StatCard icon="⚧" label="Gender" value={genderLabel(user?.gender)} />
        </View>
        <View style={styles.statsGrid}>
          <StatCard
            icon="🪪"
            label="Aadhaar (Last 4)"
            value={user?.aadhaarNumber ? `XXXX-XXXX-${user.aadhaarNumber}` : '—'}
          />
          <StatCard
            icon="📅"
            label="Member Since"
            value={user?.createdAt
              ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
              : '—'}
          />
        </View>

        {/* ── Address ──────────────────────────────────────────────────── */}
        {user?.address && (
          <>
            <Text style={styles.sectionTitle}>Address</Text>
            <View style={styles.addressCard}>
              <Text style={styles.addressIcon}>📍</Text>
              <Text style={styles.addressText}>{user.address}</Text>
            </View>
          </>
        )}

        {/* ── Quick Actions ─────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          {[
            { icon: '🔍', label: 'Find Service' },
            { icon: '📋', label: 'My Bookings' },
            { icon: '💬', label: 'Messages' },
            { icon: '⚙️', label: 'Settings' },
          ].map((action) => (
            <Pressable
              key={action.label}
              style={({ pressed }) => [styles.actionItem, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View style={styles.actionIcon}>
                <Text style={{ fontSize: 22 }}>{action.icon}</Text>
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0d0d1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  blobTop: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#0B7A4B',
    opacity: 0.12,
  },
  blobBottom: {
    position: 'absolute',
    bottom: -80,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#3b82f6',
    opacity: 0.1,
  },

  // ── Top bar ─────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 24,
  },
  greeting: {
    fontSize: 22,
    color: '#ffffff',
    fontWeight: '700',
  },
  greetingName: {
    color: '#0B7A4B',
  },
  greetingDate: {
    fontSize: 13,
    color: '#8888aa',
    marginTop: 2,
  },
  signOutBtn: {
    backgroundColor: 'rgba(255,80,80,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,80,80,0.3)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  signOutText: {
    color: '#ff6060',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Profile card ────────────────────────────────────────────────────
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 28,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#0B7A4B',
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0B7A4B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  profileEmail: {
    fontSize: 13,
    color: '#8888aa',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    backgroundColor: 'rgba(11,122,75,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(11,122,75,0.3)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  verifiedDot: { fontSize: 12 },
  verifiedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0B7A4B',
  },

  // ── Section title ────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
    marginTop: 4,
  },

  // ── Stats grid ───────────────────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 4,
    marginHorizontal: -6,
  },

  // ── Address ──────────────────────────────────────────────────────────
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  addressIcon: { fontSize: 20, marginTop: 1 },
  addressText: {
    flex: 1,
    fontSize: 14,
    color: '#ccccee',
    lineHeight: 20,
  },

  // ── Quick Actions ────────────────────────────────────────────────────
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionItem: {
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 11,
    color: '#8888aa',
    fontWeight: '500',
    textAlign: 'center',
  },
});
