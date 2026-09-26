import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import ContactAvatar from '../../components/ContactAvatar';
import EmptyState from '../../components/EmptyState';
import { radius, spacing, typography } from '../../constants/theme';
import { makeStyles } from '../../hooks/useTheme';
import useTabBarSpace from '../../hooks/useTabBarSpace';
import { formatChatTime, useChats } from '../../services/chatStore';

const SIDE = spacing.lg - spacing.xs;
const AVATAR = 52;

function ChatRow({ chat, onPress }) {
  const styles = useStyles();
  const last = chat.messages[chat.messages.length - 1];
  const hasUnread = chat.unread > 0;
  const preview = last ? `${last.fromMe ? 'You: ' : ''}${last.text}` : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${chat.name}. ${hasUnread ? `${chat.unread} unread. ` : ''}${preview}`}
    >
      <ContactAvatar name={chat.name} photo={chat.photo} color={chat.color} size={AVATAR} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {chat.name}
          </Text>
          {last ? (
            <Text style={[styles.time, hasUnread && styles.timeUnread]}>{formatChatTime(last.at)}</Text>
          ) : null}
        </View>
        <View style={styles.rowBottom}>
          <Text style={[styles.preview, hasUnread && styles.previewUnread]} numberOfLines={1}>
            {preview}
          </Text>
          {hasUnread ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{chat.unread > 99 ? '99+' : chat.unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function Messages() {
  const styles = useStyles();
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();
  const chats = useChats();
  const unreadChats = chats.filter((chat) => chat.unread > 0).length;

  const openChat = useCallback((id) => router.push({ pathname: '/chat/[id]', params: { id } }), [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Inbox
        </Text>
        {unreadChats ? <Text style={styles.subtitle}>{unreadChats} unread chats</Text> : null}
      </View>
      <FlatList
        data={chats}
        keyExtractor={(chat) => chat.id}
        renderItem={({ item }) => <ChatRow chat={item} onPress={() => openChat(item.id)} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={[styles.list, { paddingBottom: tabBarSpace }]}
        ListEmptyComponent={
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No messages yet"
            body="Once a worker accepts your job, you can chat with them here."
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: SIDE,
    paddingTop: spacing.sm + 4,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.heading,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: 2,
  },
  list: {
    paddingTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 2,
    paddingHorizontal: SIDE,
    paddingVertical: spacing.sm + 4,
  },
  rowPressed: {
    backgroundColor: colors.primaryPressed,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    ...typography.button,
    flex: 1,
    fontWeight: '700',
    color: colors.text,
  },
  time: {
    ...typography.label,
    color: colors.textMuted,
  },
  timeUnread: {
    color: colors.primary,
    fontWeight: '700',
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  preview: {
    ...typography.body,
    flex: 1,
    color: colors.textMuted,
  },
  previewUnread: {
    color: colors.text,
    fontWeight: '500',
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
    color: colors.textOnPrimary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: SIDE + AVATAR + spacing.md - 2,
  },
}));
